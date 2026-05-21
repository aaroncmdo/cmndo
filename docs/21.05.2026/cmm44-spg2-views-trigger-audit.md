# CMM-44 SP-G2 PR2 — View/Trigger-Audit + Migration (vor Apply)

**Datum:** 2026-05-21
**Branch:** kitta/cmm-44-spg2-pr2-rewire (off origin/staging, das PR1 #1521 enthaelt)
**Migration:** `supabase/migrations/20260521093039_cmm44_spg2_rewire_claim_id.sql` (geschrieben, **NICHT appliziert**)

## Drift-Recheck (live 2026-05-21)
`scripts/cmm44-spg2-measure.sql`: `derive_trigger_present=1`, `derive_func_present=1`,
`violations=0`, `raise_trap=0`, `faelle_claim_null=0`, `dup_claim_ids=0`, `termine=18` (12 claim-los).
Alle SP-G2-Annahmen halten weiterhin (faelle inzwischen 46 Zeilen — Invariante unveraendert).

## Trigger-Audit
- **Vorhanden:** `trg_sync_gutachter_termine_claim_id` (BEFORE INSERT OR UPDATE OF fall_id) +
  Funktion `sync_gutachter_termine_claim_id()` (SECURITY DEFINER, **liest faelle**). → Block 1 droppt beide.
- **Neu:** `validate_gutachter_termine_claim_id()` + `trg_validate_gutachter_termine_claim_id`
  (BEFORE INSERT OR UPDATE **OF fall_id, claim_id**), RAISE nur bei `fall_id IS NOT NULL AND claim_id IS NULL`.
  Liest faelle nicht. → Block 2.

## View-Audit — ZWEI Views koppeln Termine an faelle (live verifiziert)
Enumeriert ueber `information_schema.views` + `pg_get_viewdef`:

| View | Termin-Kopplung heute | Aenderung (Block 3) |
|---|---|---|
| `v_faelle_mit_aktuellem_termin` | LATERAL: `... FROM gutachter_termine gt WHERE gt.fall_id = f.id AND gt.status = ANY(...) ORDER BY ... LIMIT 1` | `gt.fall_id = f.id` → `gt.claim_id = c.id` (c = `LEFT JOIN claims c ON c.id = f.claim_id`). Status-Filter + ORDER BY + LIMIT unveraendert. Eine separate `cur_auftrag`-LATERAL (SP-H, auftraege) bleibt unberuehrt. |
| `v_claim_timeline` | Termin-UNION-Branch: `SELECT md5('termin-'…), f.claim_id, gt.fall_id, … FROM gutachter_termine gt JOIN faelle f ON f.id = gt.fall_id WHERE f.claim_id IS NOT NULL` | `f.claim_id` → `gt.claim_id`; `JOIN faelle f ON f.id = gt.fall_id WHERE f.claim_id IS NOT NULL` → `WHERE gt.claim_id IS NOT NULL`. **Nur dieser Branch** — die uebrigen ~15 `JOIN faelle`-Branches gehoeren anderen Sub-Projekten/Phase 6. `gt.fall_id` bleibt als Output-Spalte. |

Beide `gt.claim_id` und `f.claim_id`/`c.id` sind `uuid` → keine Precision-/Typ-Frage. Verhaltensidentisch:
`faelle_claim_null=0` (kein claim-loser Fall verliert Termin-Anzeige), `dup_claim_ids=0` (1:1, kein Fan-out),
die 12 claim-losen Termine (`fall_id`/`claim_id` NULL) waren und bleiben in beiden Views ausgeschlossen.

## Migrationsbau (deterministisch)
Die beiden View-Bloecke wurden **wortgetreu** aus den live `pg_get_viewdef`-Defs uebernommen und je
mit **genau einer** (v_faelle) bzw. **zwei** (v_claim_timeline) String-Ersetzungen geaendert, jede mit
Occurrence-Count-Assertion (== 1, sonst Abbruch). Anker eindeutig: `WHERE gt.fall_id = f.id`
(nur Termin-LATERAL), die `md5('termin-'…)`-Zeile (nur Termin-Branch), `ON f.id = gt.fall_id`
(nur der Termin-Branch joint faelle ueber den gt-Alias). Alle anderen View-Zeilen sind unveraendert.

## Dry-Run
`BEGIN; … ROLLBACK;` gegen Live-DB → **kein Fehler** (`rows: []`). CREATE-OR-REPLACE beider Views
typstabil, Trigger-Swap sauber. Nicht appliziert.

## APPLY-GATE (kritisch)
PR2-Migration **erst applizieren, wenn PR1-Writer-Code auf PROD laeuft** (nicht nur auf main gemergt).
Sonst: prod bucht mit altem Code (kein claim_id) + Ableitungs-Trigger ist weg + Validierungs-Trigger
RAISEt → Prod-Buchung bricht (AAR-599-Klasse). PR1 #1521 ist auf main gemergt (12098f97); der prod-Deploy
(PM2 reload) muss bestaetigt sein. Danach: Apply + `migration repair` + `scripts/cmm44-spg2-verify.sql` +
Portal-Smoke (Buchung + Fallakte-Timeline + Kalender).
