# CMM-44 Phase 3 (Writer-Migration) — SV-Leadpreis-Slice (2026-05-26)

**Kontext:** Phase 3 = die faelle-Writer/Reader auf claims/Sub-Tabellen umstellen (Claim-as-SSoT,
faelle -> Phase-6-DROP). Diese Slice relocatet den per-Case **Lead-Preis** auf claims. Folgt auf
die Bankdaten-Slice (PR #1789, gemergt). Roadmap-Quelle: `handoff-cmm44-phase3-writer-migration-2026-05-26.md` §5.

## Was relocatet wurde

`faelle.lead_preis_netto / lead_preis_typ / lead_preis_berechnet_am` -> `claims` (additiv, kein
faelle-DROP). 1 Fall = 1 Claim, der Lead-Preis ist claim-global.

**Begruendung (Split-Home schliessen):** Die INVARIANTE ist `lead_preis_netto =
guthaben_verrechnet_netto + sv_nachzahlung_netto`. Die beiden Summanden liegen seit **SP-J Bucket B**
bereits auf claims — nur die Summe (`lead_preis_*`) hing noch auf faelle. Diese Slice macht den Cluster
konsistent.

## Overlap-Audit (Pflicht laut Roadmap §3) — GEKLAERT

`gutachter_abrechnungen.leadpreis` (numeric) + die Abrechnungs-Positions-Snapshots
(`lead_preis_netto`/`lead_preis_typ`, `: string`-Typ, position_nr) sind **Abrechnungsdokument-Felder**
(Header-Aggregat / Line-Item-Snapshot), KEINE konkurrierende Heimat fuer den live per-Case-Preis.
Bleiben unangetastet. Nur `faelle.lead_preis_*` wandert.

## Daten-Stand (2026-05-26, live)

- coverage = 0 (`faelle.lead_preis_netto IS NOT NULL` -> 0 rows) -> Backfill faktisch No-Op.
- `legacy_faelle_ohne_claim = 0` -> alle faelle haben claim_id; die claim-aware Reads nutzen immer
  den claims-Wert (faelle-Fallback ist defensiv, nie getroffen).

## Migration `20260526181229_cmm44_phase3_sv_leadpreis_claims_adds.sql` (APPLIZIERT + verifiziert)

- 3 ADD COLUMN auf claims. **`lead_preis_netto numeric(10,2)`** — MUSS faelle-Praezision matchen.
  Erster Versuch mit `numeric` warf `42P16 cannot change data type of view column ... numeric(10,2)
  to numeric` beim View-Repoint (View-Spalte erbt faelle-Typ). Lektion CMM-44 SP-G (Precision).
- IS-NULL-guarded Backfill (idempotent, No-Op bei coverage=0).
- View-Repoint `v_faelle_mit_aktuellem_termin`: `f.lead_preis_{netto,typ,berechnet_am}` -> `c.*`
  (RAISE-guarded, alle 3 view-projiziert), security_invoker erhalten.
- **Apply via `npx supabase db push`** (Regel 2, KEIN MCP apply_migration). Atomar (BEGIN/COMMIT) ->
  die ersten Fehlversuche (Timeout/Precision) rollten sauber zurueck, kein Drift.
- DB-Verify: claims 3 cols korrekte Typen, migration registered, View netto:c/typ:c/berechnet:c +
  kein f.lead_preis-Rest + security_invoker=false, backfill divergent_rows=0.

## Code-Sweep (9 Files)

**Writer:**
- `claim-duplicate-columns.ts`: 3 Spalten in `CLAIM_OWNED_DUPLICATE_COLUMNS` -> `splitOrKeepFaelleUpdate`
  routet sie automatisch auf claims (deckt **processCaseBilling** + **revertCaseBilling**).
- `cron/monatsabrechnung/route.ts`: DIRECT-Writer (nicht via Helper) -> manuell auf `claims.update`
  via `fall.claim_id` repointet (+ claim_id zur View-Query ergaenzt). Cron ist DEPRECATED, Guard wenn
  claim_id null.

**Reader (faelle.lead_preis_* direkt):**
- `process-case-billing.ts`: **Idempotenz-Guard** (`if lead_preis != null return null`) liest jetzt
  `claims.lead_preis_netto` (via Embed) statt faelle. KRITISCH: sonst Doppel-Billing (faelle bleibt
  NULL -> Guard greift nie). Claim-aware (Legacy ohne claim_id liest faelle-Fallback).
- `sv-lead-ablehn-actions.ts`: claim-aware Read fuer den `revertCaseBilling`-Trigger.
- `admin/finance/(hub)/page.tsx` (Leadkosten-Monat) + `offene-faelle/page.tsx` (Filter
  `lead_preis_netto IS NULL`) + `cron/community-leaderboard-update/route.ts` (Umsatz): Embed-Filter
  `.is/.not('claims.lead_preis_netto', ...)` + Read aus claims-Embed. Pattern identisch zum
  bestehenden `.gte('claims.created_at', ...)`.
- `revert-case-billing.ts`: unbenutzten `lead_preis_netto`-Read aus dem Select entfernt (Reset auf 0
  laeuft via Helper).
- `database.types.ts`: 3 Spalten in claims Row/Insert/Update.

**Auto-gedeckt (KEIN Code-Change):** `reissue-abrechnung.ts` + `cron/abrechnung-erstellen/route.ts`
lesen `lead_preis_*` bereits via die View -> der View-Repoint deckt sie. `state-machine.ts` loggt nur
den Return-Wert.

## Audit (7 Punkte)

- **Build:** tsc 0 Fehler in den 9 Files (filtered); 11 pre-existing native-dep-Fehler (@react-pdf/
  sharp/pdf-parse) in nicht-angefassten *-pdf.tsx/ocr/branding = CI/Linux-Gate. Voller `npm run build`
  lokal nicht aussagekraeftig (native-deps), wie Bankdaten-Praezedenz.
- **UI:** kein UI-Change (Relocation; Finance-Pages zeigen gleiche Daten via repointete Quelle).
- **Redundanz:** splitOrKeepFaelleUpdate + Embed-Filter-Pattern + View-Repoint wiederverwendet.
- **Dead-Code:** unbenutzten Read entfernt, stale Kommentare aktualisiert.
- **Spec:** Lead-Preis-Cluster komplett auf claims; Overlap geklaert; status/sv_id/Cardentity bewusst NICHT (eigene Slices).
- **Inkonsistenz:** numeric(10,2) = faelle-Praezision; claim-aware Reads mit Array.isArray-Normalisierung; Result-Pattern unveraendert.
- **Regression:** alle faelle.lead_preis_*-Reader/Writer gesweept; Doppel-Billing-Guard gefixt; DB-verifiziert.

## Phase-3-Roadmap-Stand

- Bankdaten ✅ (PR #1789, gemergt)
- **SV-Leadpreis ✅ (diese Slice, PR gegen staging)**
- `status` — naechste, EIGENES SP (groesster Phase-6-Hebel, hoechstes Risiko): liegt schon auf
  claims+faelle (Duplikat), aber NICHT in CLAIM_OWNED_DUPLICATE_COLUMNS. Mehrere DIRECT-Writer
  (state-machine, lexdrive, sv-zuweisung, VorOrtPanel) + Reader ueberall. Erst Konsistenz claims.status
  vs faelle.status live klaeren, dann Reader+Writer-Sweep.
- `sv_id`-Slice (bidir. Sync-Trigger -> eigener Slice), dann Cardentity/Fahrzeug (offene Audits §3.1c / Cluster-H).

**Env/Gotchas:** Projekt `paizkjajbuxxksdoycev`. Pool intermittent unter 8 Parallel-Sessions (MCP +
db push beide zeitweise timeout) — ruhigen Slot abwarten, db push ist atomar (Re-Run sicher). Frischer
Worktree via `git worktree add` braucht node_modules-Junction + Kopie von `supabase/.temp/` (Link-State)
fuer tsc/db-push. NICHT Merge-Session -> PR `--base staging`.
