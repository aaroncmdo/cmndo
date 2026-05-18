# CMM-60 Schritt 3 — `sv_id`-Writer auf `claims` + Reverse-Sync (Design)

**Datum:** 2026-05-16 · **Ticket:** CMM-60 · **Branch:** `kitta/cmm-60-schritt3-sv-id-writer`
**Vorgänger:** Schritt 1 (`claims.sv_id` + `faelle→claims`-Trigger, #1391), Schritt 2 (`is_sv_for_claim` claims-nativ, #1393), Schritt 2b (`v_claim_sv`, #1395)

---

## 1 · Ziel & Scope

`claims.sv_id` ist seit Schritt 1 die kanonische SV-Zuweisung, wird aber bisher nur **passiv** befüllt — der `faelle→claims`-Übergangs-Trigger spiegelt, was die Writer nach `faelle.sv_id` schreiben. Schritt 3 dreht die Richtung um: die **Writer schreiben `claims.sv_id`** (die SSoT-Seite), ein neuer Reverse-Trigger hält `faelle.sv_id` für die noch faelle-lesenden Stellen synchron.

**In Scope:**
- Reverse-Sync-Trigger `claims.sv_id → faelle.sv_id`.
- Umstellung der `faelle.sv_id`-UPDATE-Writer auf `claims.sv_id`.
- `claims.sv_id` im Claim-INSERT der Lead-Konversion setzen.

**NICHT in Scope:**
- Drop des `faelle→claims`-Triggers — bleibt bis Phase 6 (`faelle`-Drop). Entscheidung Aaron 2026-05-16: **bidirektionale Sync behalten** als Sicherheitsnetz.
- Reader-Migration / `is_sv_for_claim`-Closure — Phase 4.

**Erfolgskriterium:** Eine SV-Zuweisung über `sv-zuweisung` setzt `claims.sv_id`; `faelle.sv_id` wird per Reverse-Trigger gespiegelt. Ein `claims.sv_id`-UPDATE spiegelt nach `faelle`, ein `faelle.sv_id`-UPDATE weiter nach `claims` — kein Trigger-Loop.

---

## 2 · Architektur — bidirektionale Sync

Nach Schritt 3 existieren **zwei** Trigger, beide `pg_trigger_depth()`-geguarded:

| Trigger | Tabelle | Event | Richtung |
|---|---|---|---|
| `trg_sync_faelle_sv_id_to_claims` (besteht, Schritt 1/2) | `faelle` | `AFTER INSERT OR UPDATE OF sv_id` | `faelle.sv_id → claims.sv_id` |
| `trg_sync_claims_sv_id_to_faelle` (**neu**) | `claims` | `AFTER INSERT OR UPDATE OF sv_id` | `claims.sv_id → faelle.sv_id` |

**Loop-Schutz:** Trigger A feuert → schreibt Zielseite → Trigger B würde bei `pg_trigger_depth() > 1` feuern → Guard `RETURN NEW` ohne Schreiben. Symmetrisch. Bewährt aus Schritt 1 (`sync_faelle_sv_id_to_claims` hat den Guard bereits).

Damit ist `sv_id` egal von welcher Seite geschrieben konsistent — die Writer können schrittweise migrieren, übersehene/künftige `faelle.sv_id`-Writes propagieren weiter. `faelle→claims` fällt erst mit dem `faelle`-Drop (Phase 6).

---

## 3 · Writer-Inventur + Umstellung

`faelle.sv_id`-Writer (empirisch via Grep `sv_id:` + `.from('faelle')`, 2026-05-16):

| # | Stelle | Heute | Schritt 3 |
|---|---|---|---|
| 1 | `src/app/api/sv-zuweisung/route.ts` (~Z.225) | `faelle.update({sv_id, organisation_id, sv_zugewiesen_am, status})` | `sv_id` raus aus dem faelle-Update; zusätzlich `claims.update({sv_id}).eq('id', <claim_id des Falls>)`. `organisation_id`/`sv_zugewiesen_am`/`status` bleiben im faelle-Update (faelle-Spalten). |
| 2 | `src/app/api/termin/ablehnen/route.ts` (~Z.51) | `faelle.update({sv_id: null, updated_at})` | `sv_id: null` raus; `claims.update({sv_id: null})` über `claim_id`. `updated_at` bleibt im faelle-Update. |
| 3 | `src/app/gutachter/fall/[id]/actions.ts` (~Z.557) | `faelle.update({sv_id: null, updated_at})` | wie #2. |
| 4 | `src/lib/leads/convert-lead-to-claim.ts` (`claimsInsert`) | `claims`-INSERT **ohne** `sv_id`; `sv_id` kommt über `fallComputedFields` in den faelle-INSERT | `sv_id` (= `input.svIdFromTermin`) zusätzlich in `claimsInsert` aufnehmen. `fallComputedFields.sv_id` **bleibt** (siehe „Reihenfolge bei #4" unten — Ordering-Schutz). |

**`claim_id`-Auflösung für #1–#3:** Die Writer kennen die `fall_id`. `claims.update(...)` braucht die `claim_id` — entweder per `.eq('id', fall.claim_id)` (faelle-Row liefert `claim_id`, ist dort vorhanden) oder per Sub-Select. Konkret: vor dem Update `faelle.claim_id` laden (die Writer lesen den Fall ohnehin), dann `claims.update({sv_id}).eq('id', claimId)`.

**Reihenfolge bei #4:** `convert-lead-to-claim` legt erst `claims` an (Z.252), dann `faelle` (Z.405). `claims.sv_id` im Insert → beim faelle-INSERT greift der `faelle→claims`-Trigger nicht für sv_id (faelle.sv_id ist dann null), aber der `claims→faelle`-Trigger hat beim claims-INSERT noch keine faelle-Row gefunden. **Lösung:** der Reverse-Trigger deckt nur den Normalfall; für die Konversion setzt `convert-lead-to-claim` `faelle.claim_id` ohnehin nach dem Insert — der saubere Weg ist, `sv_id` im `fallComputedFields` zu **belassen** (gleicher Wert wie `claims.sv_id`), dann ist `faelle.sv_id` schon beim Insert korrekt und der `faelle→claims`-Trigger bestätigt nur. **Entscheidung:** `sv_id` bleibt in `fallComputedFields` UND wird in `claimsInsert` gesetzt — beide aus derselben Quelle `input.svIdFromTermin`, kein Konflikt, kein Ordering-Problem.

**Test-Seeder — keine Änderung.** `seed-testdata`, `create-test-fall`, `seed-test-data`, `lifecycle-seed` inserten `faelle` mit `sv_id`; der `faelle→claims`-Trigger spiegelt nach `claims`. Bidirektionale Sync deckt sie ab (YAGNI).

---

## 4 · Migration

`supabase/migrations/<ts>_cmm60_schritt3_reverse_sync_claims_sv_id.sql`:

```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_claims_sv_id_to_faelle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.sv_id IS DISTINCT FROM OLD.sv_id THEN
    UPDATE public.faelle f
    SET sv_id = NEW.sv_id
    WHERE f.claim_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_claims_sv_id_to_faelle ON public.claims;
CREATE TRIGGER trg_sync_claims_sv_id_to_faelle
  AFTER INSERT OR UPDATE OF sv_id ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.sync_claims_sv_id_to_faelle();

COMMIT;
```

`OLD` ist bei INSERT NULL → `NEW.sv_id IS DISTINCT FROM OLD.sv_id` greift korrekt. Apply: Targeted-Apply + `migration repair` (isochrone-Drift). Danach `database.types.ts` regenerieren.

---

## 5 · Verifikation / Smoke

1. **Trigger-Smoke** (transaktional, ROLLBACK):
   - `claims.sv_id`-UPDATE → `faelle.sv_id` gespiegelt.
   - `faelle.sv_id`-UPDATE → `claims.sv_id` gespiegelt (Schritt-1-Trigger).
   - Kein Loop: nach beidseitigem UPDATE genau ein konsistenter Wand-Wert, `pg_trigger_depth`-Guard greift.
2. **Code-Smoke:** SV-Zuweisung über `POST /api/sv-zuweisung` gegen staging → `claims.sv_id` gesetzt, `faelle.sv_id` gespiegelt; Termin-Ablehnung → beide auf NULL.
3. `tsc --noEmit` grün, `npm run build` für die berührten Route-Files (Server-Actions/Routen → AGENTS.md §post-task-audit verlangt vollen Build).
4. SV-Portal-UI-Smoke gegen staging (Login `test-sv`, `/gutachter` + Fallakte) — kein Regress beim SV-Zugriff.

---

## 6 · Danach

- **Phase 4:** SV-`claims`-Reader auf `v_claim_sv`; `is_sv_for_claim` aus `claims_kunde_sv_dispatch_select_consolidated` → Closure.
- **Phase 6:** `faelle`-Drop — dann fallen `faelle→claims`-Trigger + `fallComputedFields.sv_id` weg.
