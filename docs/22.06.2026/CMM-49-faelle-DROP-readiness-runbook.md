# CMM-49 — `DROP TABLE public.faelle` Readiness-Runbook

**Projekt:** `paizkjajbuxxksdoycev` · **Stand:** 2026-06-22
**Quelle:** 3-Dimensionen Multi-Agent-Audit (convert-cutover / db-safety / code-surface) + Live-DB-Re-Verifikation + manuelle Gegenprüfung der Code-Findings (2 Agent-Fehlbefunde korrigiert, s.u.).

---

## 1 · Verdict

> **GO — bedingt**, sobald die **7 Retire-PRs in prod** sind (#3047 #3049 #3051 #3057 #3060 #3065 #3067). Keine echten Code-Blocker; die DB ist unconditional DROP-sicher; der Convert-Pfad ist data-lossless.

| Dimension | Verdict | Blockt DROP? |
|---|---|---|
| **DB-Safety** | ✅ safe | Nein — **0 abhängige Views**, **0 eingehende FKs** (live `pg_depend`/`pg_constraint`). CASCADE nicht einmal strikt nötig. |
| **convert-cutover** | ✅ safe | Nein — `convertLeadToClaim` + `create-for-fall` sind claim-first (bridge statt faelle-Row), jedes Feld re-homed, kein Reader erwartet eine faelle-Row. |
| **code-surface** | ✅ safe* | Nein — *die 2 vom Audit-Agenten gemeldeten „Blocker" sind **Fehlbefunde** (s.u. §3), manuell gegen `origin/staging` widerlegt. |

---

## 2 · Verifizierte Fakten (live, 2026-06-22)

- **Views:** `pg_depend` → 0 Views/Matviews hängen an `public.faelle`.
- **FKs:** `pg_constraint contype='f' confrelid='public.faelle'` → 0 eingehende FKs. (Die 14 internen `RI_ConstraintTrigger` sind *ausgehende* FK-Enforcer faelle→other und verschwinden mit der Tabelle.)
- **Trigger auf faelle:** 4 nicht-interne, alle CASCADE-gedroppt mit der Tabelle. Ihre Funktionen bleiben (CASCADE droppt Trigger-Objekte, nicht `pg_proc`):
  - `check_fall_claim_id()`, `sync_faelle_claim_bridge()`, `sync_faelle_sv_id_to_claims()` — **nur an faelle gebunden** → nach DROP verwaist → in derselben Migration droppen.
  - `update_updated_at()` — **SHARED, an 8 Tabellen gebunden** (faelle, leads, profiles, sachverstaendige, tasks, kunde_live_position, sv_tages_session, vehicle_vorschaeden) → **NICHT droppen** (nur der faelle-Trigger geht via CASCADE).
- **DML-Funktionen mit faelle-Body:** `delete_fall_komplett` + `dsgvo_anonymize_user_data` sind mit `IF EXISTS(information_schema…faelle)`-Runtime-Guard versehen → nach DROP No-Op, kein Fehler. (Optionales Tidying, nicht nötig.)
- **convert-cutover:** `convert-lead-to-claim.ts` Schritt 8 (Z.731-747) upsertet nur eine `faelle_claim_bridge`-Row (`fall_id=claim_id`); `buildFallInsertFromLead`/`fallComputedFields` werden von **0 Prod-Code** mehr aufgerufen (nur Tests). Jedes Feld des alten faelle-INSERT ist re-homed (claims/claim_parties/personen/vehicles/firmen/kanzlei_faelle/leads). Invariante: 84/84 claims haben eine Bridge-Row.
- **Homeless-Felder (`vs_kuerzung_grund`, `kuerzungs_betrag`, `gegner_versicherung_anfrage_datum`):** je **0 von 82** Zeilen non-null → DROP zerstört **0 reale Daten**.

---

## 3 · Korrigierte Audit-Fehlbefunde (NICHT nachjagen)

Der code-surface-Agent meldete 2 „Blocker", die manuell gegen `origin/staging` als **Fehlbefunde** widerlegt wurden:

- **~~GAP-1 `sv-zuweisung/route.ts:247` faelle.status-Write~~ → FALSE POSITIVE.** Der Code schreibt `claims.update({sv_zugewiesen_am, operative_status})` (Z.253-255); `updateErr` ist der **claims**-Fehler. Z.247-249 ist ein *Kommentar* „CMM-74: faelle.status-Write retired". Der Agent verwechselte den retired-Kommentar + die `'sv-gesucht'/'sv-zugewiesen'`-Werte (jetzt auf `operative_status`) mit einem Live-faelle-Write. **Kein faelle-Write vorhanden.**
- **~~GAP-2 `db-backup` BACKUP_TABLES listet 'faelle'~~ → FALSE POSITIVE.** `BACKUP_TABLES` (Z.10-26) enthält **kein** `'faelle'`; der Agent las die Kommentarzeile (Z.6 „'faelle' ist deprecated") als Array-Eintrag. Bereits 2026-06-20 korrigiert.

**Lehre:** Agent-Code-Findings vor Aktion gegen die Ref-direkt-Quelle prüfen (Kommentarzeilen ausschließen) — vgl. Rest-Ref-Gate-Lehre.

---

## 4 · Offene Aaron-Entscheide (KEINE DROP-Blocker)

### GAP-3 — `claims.hat_vorschaeden` DEFAULT `NULL` (nicht `false`)
- Live: `claims.hat_vorschaeden` hat `column_default = NULL`. Der alte faelle-Pfad setzte `false`; `claimsInsert` setzt die Spalte nicht explizit → DB-Default `NULL`. `v_claim_full.hat_vorschaeden` liest `c.hat_vorschaeden` → neue Claims liefern `NULL` statt `false`.
- Bereits **heute aktiv** (Folge des Convert-Cutovers, nicht des DROP). Echtes Vorschaden-Signal bleibt `vehicle_vorschaeden` → `vorschaden_anzahl`; `hat_vorschaeden` ist nur das Boolean-Flag. NULL = „nicht erhoben" ist vertretbar.
- **Falls `false`-Default gewünscht:** `ALTER TABLE claims ALTER COLUMN hat_vorschaeden SET DEFAULT false` (via Plugin) + optional Backfill `UPDATE claims SET hat_vorschaeden=false WHERE hat_vorschaeden IS NULL`. (Inkrement-3 #3078 macht das Editing jetzt funktionsfähig → der Wert ist setzbar.)

### Homeless-Felder → aus `FALL_EDITABLE` raus (0 Daten, KEINE claims-DDL)
- `vs_kuerzung_grund` / `kuerzungs_betrag` / `gegner_versicherung_anfrage_datum`: 0/0/0 non-null, keine claims-Heimat, nicht in v_claim_full → „editierbar ins Leere". Nach DROP DROP-tolerant (Keystone), aber sinnlos editierbar.
- **Empfehlung:** aus jeder `FALL_EDITABLE`-Liste / Feststellungs-Feld-Config nehmen. `vs_kuerzung_*` gehören fachlich in den Abrechnungs-/Regulierungs-Layer (`abrechnungen`/claims-finance), falls je gebraucht — **nicht** zurück nach faelle. Begründung im Commit dokumentieren.

---

## 5 · DROP-Runbook (wenn die 7 PRs in prod sind)

**Vorbedingung:** `git grep "from('faelle')" origin/main -- 'src/**'` (Ref-direkt, Kommentare ausschließen) → nur DROP-tolerante + Test/Seed-Treffer.

**Schritt A — DDL via Plugin `apply_migration` (Regel 2, NICHT raw execute_sql):**
```sql
-- name: drop_faelle_table_and_orphaned_sync_fns
-- Live verifiziert: 0 abhängige Views, 0 eingehende FKs. CASCADE entfernt NUR die
-- 4 faelle-gebundenen Trigger + die ausgehenden RI-Trigger; KEINE Fremdobjekte, KEINE pg_proc.
DROP TABLE IF EXISTS public.faelle CASCADE;

-- Verwaiste sync-Funktionen (je nur an faelle gebunden, nach DROP unerreichbar).
-- update_updated_at() NICHT droppen (an 8 Tabellen gebunden).
DROP FUNCTION IF EXISTS public.check_fall_claim_id() CASCADE;
DROP FUNCTION IF EXISTS public.sync_faelle_claim_bridge() CASCADE;
DROP FUNCTION IF EXISTS public.sync_faelle_sv_id_to_claims() CASCADE;
```

**Schritt B — Regel 2 Schritt 3+4 (Pflicht):** `list_migrations` → vom Plugin vergebene Version `<V>` ablesen → File committen als `supabase/migrations/<V>_drop_faelle_table_and_orphaned_sync_fns.sql` (Dateiname == `<V>`, sonst Twin-Drift).

**Schritt C — READ-Verifikation (`execute_sql`):**
```sql
SELECT to_regclass('public.faelle');                                            -- NULL
SELECT count(*) FROM information_schema.routines WHERE routine_schema='public'
  AND routine_name IN ('check_fall_claim_id','sync_faelle_claim_bridge','sync_faelle_sv_id_to_claims');  -- 0
SELECT to_regprocedure('public.update_updated_at()') IS NOT NULL;               -- true (shared, intakt)
SELECT count(*) FROM public.claims;                                             -- ≈84 (unverändert)
```

**Schritt D — Typen:** `generate_typescript_types` → `src/lib/supabase/database.types.ts` committen (die ~45 generierten `referencedRelation:"faelle"`-FK-Metadaten verschwinden).

**Schritt E — Smoke (prod):** 1 SV-Zuweisung (Nicht-Org-Pool) · 1 Lead-Convert (claim-first) · 1 Display-Read eines konvertierten Falls (`v_claim_full` LEFT-JOIN, keine NULL-Kaskade) · 1 `db-backup`-Run (kein faelle-Error-Log).
