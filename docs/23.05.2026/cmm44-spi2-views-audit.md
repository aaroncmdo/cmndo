# CMM-44 SP-I2 PR1 — View-Audit (vor Apply, live 2026-05-23)

Projekt `paizkjajbuxxksdoycev`. Read-only via MCP `execute_sql` (CLI `db query --linked`
gibt aktuell Pooler-544/connection-timeout; Apply spaeter via CLI durch separaten Dispatch).

## kf-Join-Status (Gotcha-Check)

```sql
SELECT
  (pg_get_viewdef('public.v_faelle_mit_aktuellem_termin',true) ~ 'LEFT JOIN kanzlei_faelle kf') AS term_has_kf,
  (pg_get_viewdef('public.v_claim_full',true) ~ 'LEFT JOIN kanzlei_faelle kf') AS full_has_kf,
  (pg_get_viewdef('public.faelle_sv_view',true) ~ 'LEFT JOIN kanzlei_faelle kf') AS svview_has_kf;
```

| View | hat kf-Join? | Behandlung |
|---|---|---|
| `v_faelle_mit_aktuellem_termin` | **JA** (SP-I1, fuer `lexdrive_*`/`klage_uebergeben_am`) | NUR 11 Spalten-Replaces, **KEIN** zweiter Join-Insert (sonst DOPPELT) |
| `v_claim_full` | NEIN | 1 Spalten-Replace (`anschlussschreiben_am`) + NEUER Join `LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id` |
| `faelle_sv_view` | NEIN | `kf.mandatsnummer` + `kf.lexdrive_case_id` ans Ende der SELECT-Liste + NEUER Join `... ON kf.claim_id = c.id` |

## Wie jede View die 11 Spalten heute speist

### v_faelle_mit_aktuellem_termin
- Alle 11 Spalten als `f.<col>` (faelle-Alias `f`): `f.anschlussschreiben_am`, `f.anschlussschreiben_url`,
  `f.anschlussschreiben_sendedatum`, `f.anschlussschreiben_unterschrift`, `f.anschlussschreiben_ocr_am`,
  `f.as_geforderte_summe`, `f.as_frist`, `f.as_vs_reaktion_text`, `f.as_salesforce_id`,
  `f.as_zuletzt_synced_am`, `f.mandatsnummer`.
- `FROM faelle f LEFT JOIN claims c ON c.id = f.claim_id LEFT JOIN gutachten g ON g.claim_id = c.id
  LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id` (kf existiert!) + 3 LATERAL (t/cur_auftrag/cp_g).
- kf wird bereits genutzt: `kf.lexdrive_case_id`, `kf.lexdrive_ocr_data`, `kf.lexdrive_ocr_received_at`,
  `kf.klage_uebergeben_am`.
- **Transform:** 11x `f.<col>` -> `kf.<col>`; `unterschrift` -> `COALESCE(kf.anschlussschreiben_unterschrift, false)`
  (zuerst ersetzen, laengster Match). KEIN Join-Insert.

### v_claim_full
- `FROM claims c LEFT JOIN faelle f ON f.claim_id = c.id LEFT JOIN gutachten g ON g.claim_id = c.id` + 2 LATERAL.
- Speist `f.anschlussschreiben_am` UND `f.mandatsnummer`.
- **Transform (Plan/Spec-Scope):** NUR `f.anschlussschreiben_am` -> `kf.anschlussschreiben_am` +
  NEUER Join `LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id`.
- **Befund/Hinweis:** `f.mandatsnummer` bleibt in v_claim_full unangetastet (Plan Step 6 + Spec §PR1
  scopen v_claim_full ausdruecklich nur auf `anschlussschreiben_am`). mandatsnummer in v_claim_full
  wird in einer spaeteren Slice/Phase-6 mitgezogen — hier additiv/scope-treu belassen.

### faelle_sv_view
- `FROM faelle f LEFT JOIN claims c ON c.id = f.claim_id LEFT JOIN gutachten g ON g.claim_id = c.id` + 2 LATERAL.
- Exponiert HEUTE **kein** AS-Feld, **kein** mandatsnummer, **kein** lexdrive_case_id (SV blind).
- Letzte SELECT-Spalte vor FROM: `c.claim_nummer`.
- **Transform:** `kf.mandatsnummer` + `kf.lexdrive_case_id` ans Ende anhaengen (CREATE OR REPLACE
  erlaubt nur Append neuer Spalten) + NEUER Join `LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id`.

## Volle viewdefs (Snapshot pre-apply)

Die kompletten `pg_get_viewdef(...)`-Outputs sind in der Migration als generierte
`CREATE OR REPLACE VIEW`-DDL eingefroren. `v_faelle_mit_aktuellem_termin` wurde server-seitig
(MCP `execute_sql`, `replace()`-Kette wie Plan Step 6, unterschrift zuerst -> COALESCE+alias) generiert
und als Artefakt `scripts/_spi2-term-ddl.sql` eingefroren; `v_claim_full` + `faelle_sv_view` via
`scripts/_spi2-gen-views.mjs` aus den verbatim Live-viewdefs (`scripts/_spi2-raw-viewdefs.json`)
mit identischer `replace()`-Logik + eingebauten Sanity-Checks generiert. Siehe
`supabase/migrations/*_cmm44_spi2_add_kanzlei_faelle_columns.sql` Block 3.

### unterschrift-COALESCE -> Spalten-Name-Erhalt (CREATE OR REPLACE)
Original `f.anschlussschreiben_unterschrift` (Output-Name `anschlussschreiben_unterschrift`) -> ersetzt
durch `COALESCE(kf.anschlussschreiben_unterschrift, false) AS anschlussschreiben_unterschrift`. Das
explizite `AS` ist Pflicht, sonst hiesse die Output-Spalte `coalesce` und `CREATE OR REPLACE VIEW`
wuerfe "cannot change name of view column". Verifiziert: alle berechneten/COALESCE/NULL-Ausdruecke
in der generierten term-View tragen ein `AS` (keine Namens-Drift). Spalten-Reihenfolge + -Anzahl
unveraendert (nur String-Replace auf Spalten-Ausdruecken, kein Add/Remove/Reorder).

## Dry-Run-Status (Task 1 Step 8)

**BLOCKED durch Supabase-API-Outage** (2026-05-23, gegen Ende der Session): sowohl Pooler
(CLI `db query --linked` + MCP `execute_sql` -> Status 544 / connection-timeout) als auch
PostgREST (`/rest/v1/*` -> HTTP 000 / 12s-Timeout) waren ueber ~4 min nicht erreichbar; DNS ok
(Cloudflare-IPs), allgemeines Internet ok (GitHub/Google 200). = Cloudflare-522-Konstellation
(origin/pool-seitig), nicht migrations-seitig. Frueher in der Session liefen MCP-Reads erfolgreich
(Typ-Messung, kf_rows=0, mandatsnummer cov=12, alle 3 viewdefs).

Dry-Run-File `scripts/_spi2-pr1-dryrun.sql` (Migration mit `COMMIT`->`ROLLBACK`) ist fertig und
muss vom Apply-Dispatch vor dem echten Apply gefahren werden:
`npx supabase db query --linked --file scripts/_spi2-pr1-dryrun.sql` -> Expected: kein Fehler.
Statische Validierung erfolgt (1x BEGIN/1x COMMIT, 0 `;;`, 3 CREATE OR REPLACE VIEW, 11 ADD COLUMN,
genau 3 kf-Joins gesamt = kein Duplikat, unterschrift-COALESCE+alias, mandatsnummer-Backfill drin).
