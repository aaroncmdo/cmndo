-- Batch-computed quality/preference score for SV finder ranking.
-- Nightly cron (api/cron/compute-partner-score) fills it; the finder adds it
-- WITHIN a paket tier (paket stays the strict primary sort key). Additive,
-- backward-compatible: existing rows default to 0 (= no change until the cron runs).
ALTER TABLE public.sachverstaendige
  ADD COLUMN partner_score integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.sachverstaendige.partner_score IS
  'Batch-computed quality/preference score 0..100 (cron api/cron/compute-partner-score). Inputs: DAT-Partner +40, Google-Reviews 0..30, Zertifikate/oeffentlich-bestellt 0..20, Tenure 0..10. Added to finder ranking within a paket tier (paket = strict primary). Default 0.';
