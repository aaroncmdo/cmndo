# T1.1b — work_state Cutover: Handoff (fresh focused run)

> **Branch:** `kitta/track1-1b-work-state-cutover` (off staging, bereit). **Referenz:** North-Star §6 + Track-1-Plan `2026-05-31-track1-lifecycle-freeze.md`. **Vorgänger:** T1.1a (Mig `20260531162225`, `claims.work_state` additiv + Backfill, **live** — PR #2132). **Entscheidungen gelockt:** D2 (work_state-Split, status nullable=a), grob (2 Werte). Voll gegroundet 31.05. — direkt ausführbar.

## Ziel
`claims.status` = reine **Lifecycle/Terminal-Achse**; die 2 Dispatch-Werte (`dispatch_done`/`in_bearbeitung`) leben in `claims.work_state` (Dispatch→KB-Besitz-Achse, schon befüllt). Reader/Writer der **claims.status-Dispatch-Werte** → `work_state`. **status bleibt vestigial** (nicht nullen, CHECK nicht verschärfen) → das ist T1.1c (kein Deploy-Window).

## Reihenfolge (bindend, kein Deploy-Window)
1. **Mini-Migration (Plugin):** `ALTER TABLE claims ALTER COLUMN status DROP NOT NULL` (additiv-safe; Genesis braucht status=NULL). CHECK/Null-ing NICHT anfassen (= T1.1c). File==recorded version.
2. **Types:** `database.types.ts` — `work_state: string | null` **surgical** in claims Row + `?: string | null` in Insert/Update adden. **KEIN** full `generate_typescript_types` (zieht sonst unmerged Parallel-Session-Schema rein).
3. **Writer → work_state** (status weglassen = NULL bei Genesis):
   - `lib/leads/convert-lead-to-claim.ts:315` `status:'dispatch_done'` → `work_state:'dispatch_done'` (status nicht setzen).
   - `lib/kanzlei-wunsch/actions.ts:576` `status:'in_bearbeitung'` → `work_state:'in_bearbeitung'`.
   - `lib/smoke/lifecycle-seed.ts:201/204/207/214` → work_state.
4. **Endzustand-Gates → work_state:** `lib/claims/endzustand-actions.ts:140` `ctx.status !== 'in_bearbeitung'` → `ctx.work_state !== 'in_bearbeitung'` + `loadClaimContext` muss `work_state` laden. **Alle `=== 'in_bearbeitung'`/`!== 'in_bearbeitung'`-Checks im File greppen** (mehrere mark*-Funktionen) — die in_bearbeitung-PRE-Conditions → work_state; die status-Ziele (in_kommunikation_vs/reguliert/…) bleiben status.
5. **Badge → `status ?? work_state`:** `ClaimStatusBadge`-Consumer (`FallakteShell.tsx`, `EndzustandDropdown.tsx`) müssen `status ?? work_state` an die Badge geben, sonst zeigen die 75 aktiven Claims keinen Badge (status geht vestigial/NULL). `status-mappings.ts` CLAIM_STATUS-Vocab bleibt **unified** (deckt beide Achsen) — NICHT zersplittern. Prüfen, ob die Consumer `work_state` in ihren Daten haben (sonst Select erweitern).
6. **`lifecycle.test.ts`** (+ ggf. `subphase-resolver.test.ts`): `claimStatus:'dispatch_done'`/`'in_bearbeitung'`-Test-Fixtures → an die neue Semantik anpassen (status=NULL für aktive; dispatch ist work_state).

## OUT of scope (NICHT anfassen)
- **`ManualStatusOverride`** (`manual-status-override.constants.ts` `ALLOWED_STATUS_VALUES` = onboarding/filmcheck/qc/ersterfassung-Mix) = **fall_status-Legacy**, NICHT claims.status. Gehört zur fall_status-Dissolution (AAR-939-koordiniert, post-Freeze). Anfassen = Achsen-Conflation.
- Die gleichnamigen `in_bearbeitung`-Werte von **gutachter_finder_anfragen** / **leads** (FlowLink) — andere Entities, NICHT claims.status.
- KB-„Fall übernehmen"-Button + Termin-Auto-Fallback + KB-Mitteilung → **T1.4** (Engine), nicht T1.1b.

## Verify
- `npm ci` (frischer Worktree) → `npx tsc --noEmit` grün.
- Post-Deploy-Smoke (staging, 3 Portale): **Genesis** (Lead→Claim erzeugt work_state=dispatch_done, status NULL), **Endzustand** (in_kommunikation_vs nur ab work_state=in_bearbeitung), **Badge** (aktive Claims zeigen „Neu"/„In Bearbeitung" via work_state; terminale via status). Screenshot je Portal.
- `v_claim_phase` unberührt (liest Dispatch-Werte nicht; EXCEPT-0/0 trivial).

## Danach
- **T1.1c** (winzig): `UPDATE claims SET status=NULL WHERE status IN ('dispatch_done','in_bearbeitung')` + `claims_status_check` auf die 10 Lifecycle/Terminal-Werte (+ NULL) verschärfen. Erst NACH T1.1b-Deploy (kein Window).
- **T1.4** (Engine): Termin-Abschluss-Fallback (work_state→in_bearbeitung falls dispatch_done) + KB-Mitteilung/ungelesen.
