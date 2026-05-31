-- T1.1a (D2, Lifecycle-Freeze North-Star §6): claims.work_state — Dispatch/Processing-Achse
-- aus claims.status rausspalten. claims.status wird (in T1.1b) die reine Lifecycle/Terminal-
-- Achse; die 2 Dispatch-Werte (dispatch_done/in_bearbeitung) ziehen nach work_state.
-- DIESER PR: rein ADDITIV — Spalte + Backfill. Kein Reader/Writer liest work_state noch.
-- Code-Cutover (Writer/Reader -> work_state) + status-CHECK-Tightening + status NULLABLE = T1.1b.
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS work_state text;
ALTER TABLE public.claims DROP CONSTRAINT IF EXISTS claims_work_state_check;
ALTER TABLE public.claims ADD CONSTRAINT claims_work_state_check
  CHECK (work_state IS NULL OR work_state = ANY (ARRAY['dispatch_done'::text, 'in_bearbeitung'::text]));
UPDATE public.claims SET work_state = status WHERE status IN ('dispatch_done', 'in_bearbeitung');
COMMENT ON COLUMN public.claims.work_state IS 'Dispatch/Processing-Achse (D2 Lifecycle-Freeze): dispatch_done|in_bearbeitung. claims.status wird die reine Lifecycle/Terminal-Achse (Cutover T1.1b). North-Star docs/superpowers/specs/2026-05-31-claimondo-datenmodell-northstar.md';
