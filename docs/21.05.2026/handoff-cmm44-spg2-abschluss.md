# Handoff — CMM-44 SP-G2 Abschluss (2026-05-21)

**Sub-Projekt:** SP-G2 — `gutachter_termine.claim_id` writer-getragen + faelle-entkoppelt (Phase-2-proper).
**Master:** CMM-44 (`faelle`-Drop). **Vorarbeit:** CMM-58 (#1385/#1389 — Spalte/FK/Index/Backfill + faelle-lesender Trigger).
**Status:** **fertig** — PR1 live auf prod, PR2 appliziert + verifiziert, PR2-PR offen zum Merge.

---

## 1 · Was erledigt wurde

| PR | Inhalt | Stand |
|---|---|---|
| **#1521** (`kitta/cmm-44-spg2-pr1-writer-reader`) | Writer setzen `claim_id` (10 INSERTs: 7 prod W-A/W-C + 3 test/seed; 2 W-D claim-los unberührt). Kein Reader-/View-/Schema-Change. CMM-58-Trigger blieb aktiv → verhaltensneutral. | **gemergt staging+main, prod-live** (merge `12098f97`) |
| **#1525** (`kitta/cmm-44-spg2-pr2-rewire`) | Migration `20260521093039`: DROP `trg_sync_gutachter_termine_claim_id`+Funktion; CREATE `validate_gutachter_termine_claim_id` (`BEFORE INSERT OR UPDATE OF fall_id, claim_id`, RAISE bei fall_id gesetzt + claim_id NULL); Re-Key `v_faelle_mit_aktuellem_termin` (LATERAL) + `v_claim_timeline` (Termin-Branch). | **appliziert + `migration repair`d**, PR offen `--base staging` |

Spec: `docs/superpowers/specs/2026-05-21-cmm44-spg2-termin-claim-id-design.md`
Plan: `docs/superpowers/plans/2026-05-21-cmm44-spg2-termin-claim-id.md`
Audit: `docs/21.05.2026/cmm44-spg2-views-trigger-audit.md`

## 2 · Verifikation (live)
- **verify-script** (`scripts/cmm44-spg2-verify.sql`): old_trigger_gone=true, old_function_gone=true, new_trigger_present=true, violations=0, view_faelle_claim=true, view_timeline_claim=true, timeline_no_faelle_join=true.
- **View-Output:** `v_faelle_mit_aktuellem_termin`=3 Faelle mit aktuellem Termin (claim_id gesetzt); `v_claim_timeline`=6 Termin-Events (alle claim_id, 0 null).
- **RAISE-Probe:** bad insert (fall_id+null claim) geblockt mit exakter Message; claim-loser Insert (fall_id null) passiert den Trigger (lief erst in den unabhängigen typ-CHECK).
- **Post-Apply-Portal-Smoke** (`scripts/smoke-cmm44-spg2.mjs`, staging): baseline-identisch (SV-Kalender/Dispatch/Kunde OK, Fallakte rendert voll). React #418 auf Fallakte ist pre-existing/benign, **nicht verschlimmert**.

## 3 · Lessons (SP-G2-spezifisch)
1. **Premissen-Drift:** SP-G2 stand im 16.05-Dekomp-Doc als „kein claim_id" — CMM-58 hatte es am selben Tag schon angelegt. Vor jedem Sub-Projekt live `information_schema`/`pg_*` nachmessen.
2. **Invertiertes Gating:** Bei destruktiver PR2 (Trigger-Drop) Reihenfolge umkehren ggü. SP-G/SP-H: PR1=Writer zuerst **prod-live**, DANN PR2-Migration. Geteilte DB → sonst prod-Buchung mit altem Code + Trigger weg → RAISE (AAR-599-Klasse).
3. **Validierungs-Trigger Scope `OF fall_id, claim_id`** — feuert nicht bei Status-/Reminder-Updates (die Masse der gutachter_termine-Writes); kein Prod-Bruch durch unbezogene Updates an evtl. driftenden Rows.
4. **Zwei Views** koppelten Termine an faelle — Re-Validierung fand `v_claim_timeline` zusätzlich zu `v_faelle_mit_aktuellem_termin`. Immer alle gt.fall_id-Views enumerieren.
5. **Deterministischer Migrationsbau:** View-Bodies wortgetreu aus live `pg_get_viewdef`, je 1/2 String-Edits mit Occurrence-Count-Assertion (==1). Verhindert versehentliche Massen-Ersetzung (`f.claim_id` kommt in v_claim_timeline ~15× vor — nur der Termin-Branch wurde geändert).
6. **`supabase db query` Multi-Statement** gibt nur das letzte Resultset → Measure/Verify als **ein** UNION-ALL mit (k,v)-Spalten.
7. **Worktree-Setup:** `.env.local` (gitignored) + `supabase/.temp/` aus Haupt-Repo in den Worktree kopieren, sonst kein `db query --linked` / kein Smoke. Lokaler Full-`npm run build` war durch ein kaputtes `require-in-the-middle` (leeres node_modules-Verzeichnis im Haupt-Repo) blockiert — CI baut clean; tsc grün.

## 4 · Lose Enden / Beobachtungen
- **`gutachter_termine.typ`-CHECK** erlaubt nur `sv_begutachtung/kb_beratung/konfrontation`. `re-termin/[token]/actions.ts` (`'besichtigung'`) + `onboarding/slots.ts` (`'vor_ort'`) verstoßen dagegen → diese Writer-Pfade sind vermutlich **pre-existing** kaputt (nicht SP-G2, separater Follow-up-Kandidat).
- `require-in-the-middle`-leeres-Verzeichnis im Haupt-Repo-`node_modules` → lokale Worktree-Builds brechen bis `npm install`-Reparatur.

## 5 · Nächster Schritt
- Aaron mergt **PR2 #1525** (Review). Migration ist bereits appliziert+`repair`d → Merge bringt nur die Datei in git, kein Re-Run.
- **SP-D** (Termin-Cluster, 25 Spalten faelle→`gutachter_termine`) ist jetzt **entsperrt** — `gutachter_termine.claim_id` ist die faelle-freie Verknüpfung. Nächstes CMM-44-Sub-Projekt.
- Verbleibend in der Strecke: SP-C (Parteien), SP-D (Termin), SP-E/F/I/J/K/L. Siehe `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` §4.
