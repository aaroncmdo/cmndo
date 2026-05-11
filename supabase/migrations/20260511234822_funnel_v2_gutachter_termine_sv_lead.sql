-- 2026-05-11: gutachter_termine bekommt sv_lead_id fuer Tier-3-Termine
-- (sv_leads, Free-Tier). Tier-3-Termine sind pre_flowlink_reserviert bis
-- Dispatcher manuell mit dem SV bestaetigt.

ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS sv_lead_id UUID
    REFERENCES public.sv_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gutachter_termine_sv_lead_id
  ON public.gutachter_termine(sv_lead_id)
  WHERE sv_lead_id IS NOT NULL;

COMMENT ON COLUMN public.gutachter_termine.sv_lead_id IS '2026-05-11 Funnel v2: gesetzt bei Free-Tier-Termin (sv_leads). Genau einer von sv_id ODER sv_lead_id.';

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='gutachter_termine'
  AND column_name IN ('sv_id', 'sv_lead_id')
ORDER BY column_name;
