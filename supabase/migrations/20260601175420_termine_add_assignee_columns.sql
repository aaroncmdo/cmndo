-- Unisone Termin-Engine Phase 1 / Task 1
-- gutachter_termine assignee-generisch machen (additiv): assignee_typ + assignee_id
-- + CHECK + Index. Backfill folgt in der naechsten Migration. sv_id/sv_lead_id/kb_id
-- bleiben als Kompat-Spalten (Transition). assignee_id bleibt NULLABLE — Status
-- sv_gesucht ist ein legaler Zustand (Termin ohne zugewiesenen Assignee).

ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS assignee_typ text,
  ADD COLUMN IF NOT EXISTS assignee_id  uuid;

ALTER TABLE public.gutachter_termine
  DROP CONSTRAINT IF EXISTS gutachter_termine_assignee_typ_check;
ALTER TABLE public.gutachter_termine
  ADD CONSTRAINT gutachter_termine_assignee_typ_check
  CHECK (assignee_typ IS NULL OR assignee_typ = ANY (ARRAY['sachverstaendiger','sv_lead','kundenbetreuer','kanzlei']));

CREATE INDEX IF NOT EXISTS idx_gutachter_termine_assignee
  ON public.gutachter_termine (assignee_typ, assignee_id, start_zeit);
