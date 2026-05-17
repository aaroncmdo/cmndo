# CMM-44 SP-A — Duplikat-Drops (34 sync-getriggerte `faelle`-Spalten)

**Datum:** 2026-05-16 · **Status:** Design — abgestimmt
**Master:** CMM-44 (Claim-SSoT-Vollmigration / `faelle`-Drop)
**Dekomposition:** `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` (Sub-Projekt SP-A)
**Strategie:** `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md` §4 Phase 3–5

---

## 1 · Ziel & Scope

SP-A entfernt die **34 Spalten**, die heute von den Triggern `sync_faelle_to_claims` /
`sync_claims_to_faelle` bidirektional zwischen `faelle` und `claims` synchron gehalten
werden. Diese 34 sind namensgleich auf beiden Tabellen — `claims.<col>` ist die SSoT und
garantiert aktuell. SP-A migriert alle `faelle`-seitigen Leser/Schreiber auf `claims` und
droppt danach die Spalten faelle-seitig.

**Schlüsselbefund:** Das Trigger-Paar `sync_faelle_to_claims` / `sync_claims_to_faelle`
synct *ausschließlich* diese 34 Spalten (verifiziert am Funktions-Body, 2026-05-16). Sind
alle 34 gedroppt, ist das Trigger-Paar funktionslos → es wird in PR2 komplett entfernt.
Damit zieht SP-A die Strategie-Phase 5 für genau dieses Trigger-Paar vor. Der separate
CMM-60-`sv_id`-Sync (`trg_sync_faelle_sv_id_to_claims` etc.) ist **nicht** betroffen.

### Die 34 Spalten

```
abgeschlossen_am, auslandskennzeichen, brn, fahrerflucht,
finanzierung_leasing, finanzierungsgeber_adresse, finanzierungsgeber_name,
finanzierungsgeber_vertragsnr, gegner_bekannt, gegner_versicherung_id,
gegner_versicherungsnummer, gewerbe_flag, kanzlei_ansprechpartner_email,
kanzlei_ansprechpartner_name, kanzlei_ansprechpartner_telefon,
kanzlei_uebergeben_am, kunde_email, kunden_konstellation, kundenbetreuer_id,
polizei_aktenzeichen, polizei_bericht_vorhanden, polizei_vor_ort,
polizeibericht_status, sachschaden_beschreibung, spezifikation,
unfall_konstellation, unfallskizze_ablehnung_grund, unfallskizze_bestaetigt,
unfallskizze_generiert_am, unfallskizze_svg, unfallskizze_url, vehicle_id,
vorsteuerabzugsberechtigt, zeugen_kontakte
```

### Nicht in Scope

- Die 5 weiteren namensgleichen DUP-Spalten (`lead_id`, `status`, `sv_id`, `created_at`,
  `updated_at`) — strukturell/Status, separat behandelt (`sv_id` ist CMM-60).
- Die 30 semantik-gleichen DUP-Spalten (`schadens_datum`→`schadentag` etc.) — eigenes
  Sub-Projekt **SP-A2** (brauchen Reader-Rename + claims-Side-Backfill-Verifikation).
- Alle MOVE/CLAIMS/TBD-Spalten — spätere Sub-Projekte SP-B..L.

### Erfolgskriterium

Nach PR2: `information_schema` zeigt 0 der 34 Spalten auf `faelle`; `sync_faelle_to_claims`
+ `sync_claims_to_faelle` (Trigger + Funktionen) existieren nicht mehr; voller Portal-Smoke
(Public/Admin/SV/Kunde/Dispatch) zeigt alle betroffenen Werte unverändert; Build grün.

---

## 2 · PR1 — Reader/Writer-Sweep (`faelle` → `claims`)

**Branch:** frisch von `origin/staging`, z.B. `kitta/cmm-44-spa-pr1-reader-sweep`.

### Vorgehen

Für jede der 34 Spalten alle `faelle`-Call-Sites in `src/` finden und auf `claims`
umstellen. Same-name → keine Spalten-Umbenennung, nur Quell-Tabelle/View wechseln.

1. **Inventur:** Pro Spalte `grep` nach `faelle`-Reads/Writes. `.from('faelle')` kommt
   488× in `src/` vor — pro Call-Site prüfen, ob eine der 34 Spalten selektiert/geschrieben
   wird. Ergebnis: Call-Site-Liste pro Spalte.
2. **Reads umstellen:** `.from('faelle').select(...)` mit einer der 34 Spalten →
   - wo eine `v_claim_*`-View die Spalte führt: aus der View lesen;
   - sonst aus `claims` (Join über `claim_id` bzw. direkter claims-Read).
3. **Writes umstellen:** `.from('faelle').update({<col>})` → auf `claims` schreiben. Der
   Sync-Trigger propagiert `claims→faelle` bis PR2 — Konsistenz bleibt in der Übergangszeit.
4. **CMM-48-Abgleich:** Writer der 34 Spalten, die im `cmm-48-writer-stellen-audit.md`
   stehen, im PR1-Commit-Body markieren, damit CMM-48 sie nicht erneut migriert.

### Abgrenzung Reader-Quelle

`claims` direkt vs. `v_claim_*`-View: bestehende Patterns im jeweiligen Portal folgen
(AGENTS.md §post-task-audit Punkt 6 — Konsistenz). Kein neuer View-Typ in SP-A.

### Ergebnis PR1

`faelle.<34>` existieren noch, Sync-Trigger laufen unverändert — aber **kein Code** liest
oder schreibt die 34 faelle-seitig. PR1 ist eigenständig deploybar + smoke-bar; es droppt
nichts und ändert kein DB-Schema.

### Verifikation PR1

- `npm run build` grün (Routen/Server-Actions betroffen → voller Build, AGENTS.md §1).
- Portal-Smoke Public/Admin/SV/Kunde/Dispatch mit Screenshots — die betroffenen Werte
  (Unfallskizze, Polizei-Felder, Kanzlei-Ansprechpartner, Finanzierung, …) erscheinen
  unverändert.
- Re-Grep: 0 verbleibende `faelle`-seitige Reads/Writes der 34 Spalten.

---

## 3 · PR2 — Trigger-Retire + `DROP COLUMN`

**Branch:** frisch von `origin/staging` **nach PR1-Merge**, z.B.
`kitta/cmm-44-spa-pr2-drop`.

### Migration (eine CLI-Migration, `npx supabase migration new`)

Reihenfolge zwingend:

1. **Einmal-Backfill** — deckt die AFTER-UPDATE-Sync-Lücke (Strategie §3.5: Trigger greifen
   nicht bei INSERT, INSERT-only-Zeilen könnten claims-seitig stale sein):
   ```sql
   UPDATE public.claims c SET <col> = f.<col>
   FROM public.faelle f
   WHERE f.claim_id = c.id AND c.<col> IS DISTINCT FROM f.<col>;
   ```
   für alle 34 Spalten (ein UPDATE mit 34 SET-Klauseln, geguarded via `IS DISTINCT FROM`).
2. **Dependency-Audit** — vor dem Drop prüfen, ob Views/Policies/weitere Trigger die 34
   Spalten auf `faelle` referenzieren:
   ```sql
   SELECT DISTINCT dependent.relname, pg_get_viewdef(dependent.oid)
   FROM pg_depend d
   JOIN pg_rewrite r ON r.oid = d.objid
   JOIN pg_class dependent ON dependent.oid = r.ev_class
   JOIN pg_class src ON src.oid = d.refobjid
   WHERE src.relname = 'faelle';
   ```
   Blockierende Views (z.B. `v_faelle_*`) **vor** dem `DROP COLUMN` anpassen oder
   `CREATE OR REPLACE`. Diese Liste wird beim Plan-Schritt live ermittelt.
3. **Trigger + Funktionen droppen:**
   ```sql
   DROP TRIGGER <trg> ON public.faelle;   -- sync_faelle_to_claims-Trigger
   DROP TRIGGER <trg> ON public.claims;   -- sync_claims_to_faelle-Trigger
   DROP FUNCTION public.sync_faelle_to_claims();
   DROP FUNCTION public.sync_claims_to_faelle();
   ```
   (Exakte Trigger-Namen beim Plan-Schritt aus `pg_trigger` holen.)
4. **`DROP COLUMN`** ×34: `ALTER TABLE public.faelle DROP COLUMN <col>;`
5. **types regen** (`npx supabase gen types`) + `npm run build`.

### Apply-Verfahren

Targeted-Apply wegen Fremd-Drift (`feedback_migration_repair_twin_drift`,
Handoff §3): `npx supabase db query --linked --file <migration.sql>` +
`npx supabase migration repair --status applied <version>`. **Kein** blankes `db push`.

### Verifikation PR2

- `information_schema.columns`: 0 der 34 Spalten auf `faelle`.
- `pg_trigger` / `pg_proc`: `sync_faelle_to_claims` + `sync_claims_to_faelle` weg.
- Stichprobe: ein `claims`-UPDATE einer ehemaligen Sync-Spalte propagiert **nicht** mehr
  nach `faelle` (Trigger weg) — und das ist korrekt, weil kein Code mehr faelle-seitig liest.
- Voller Portal-Smoke mit Screenshots (`feedback_post_drop_smoke`) — Public/Admin/SV/
  Kunde/Dispatch, betroffene Werte unverändert.
- DB-Smoke-Skript unter `scripts/` (analog `cmm44-*`-Probes).

---

## 4 · Risiken & Mitigation

| Risiko | Mitigation |
|---|---|
| Versteckte dynamische `faelle[feld]`-Reads, die `grep` nicht fängt | Portal-Smoke auf allen 5 Portalen statt nur Grep (`feedback_smoke_annahmen_alle_portale`) |
| View blockiert `DROP COLUMN` | Dependency-Audit in PR2 Schritt 2, blockierende Views vorher anpassen |
| Andere Session droppt/ändert `faelle` parallel | `information_schema` direkt vor PR2-Apply live nachmessen (`feedback_information_schema_check`) |
| INSERT-Gap → `claims` claims-seitig stale | Einmal-Backfill PR2 Schritt 1 vor dem Trigger-Drop |
| `db push`-Drift | Targeted-Apply + `migration repair` |
| Writer-Doppelmigration mit CMM-48 | PR1-Commit-Body markiert die migrierten Writer; CMM-48-Audit-Doc gegenchecken |
| PR1 mergt, PR2 verzögert sich → Zwischenzustand | Unkritisch: Trigger laufen weiter, Code liest claims, faelle bleibt konsistent. Beliebig lange haltbar. |

---

## 5 · Abgrenzung der zwei PRs

| | PR1 | PR2 |
|---|---|---|
| DB-Schema-Änderung | keine | Backfill + Trigger-Drop + 34× DROP COLUMN |
| Code-Änderung | 34 Spalten: alle faelle-Reads/Writes → claims | types regen |
| Eigenständig deploybar | ja | ja (setzt PR1-Merge voraus) |
| Smoke | Portal-Smoke | Portal-Smoke + DB-Verify |
| Rollback | git revert | Migration ist additiv-destruktiv — claims hält die Daten, faelle-Spalten wären per Re-Migration wiederherstellbar, aber 0 Reader |

---

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
