-- Kanonische SV-Lead-Quelle WP-A Task 1: Nicht-DAT-Dedup.
-- dat_id-UNIQUE existiert (sv_leads_dat_id_key). Fuer Nicht-DAT-Leads: ein Lead pro (Name, PLZ).
ALTER TABLE public.sv_leads ADD COLUMN IF NOT EXISTS normalized_name text
  GENERATED ALWAYS AS (lower(regexp_replace(coalesce(name,''), '\s+', ' ', 'g'))) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS sv_leads_nondat_dedup
  ON public.sv_leads (normalized_name, plz) WHERE dat_id IS NULL;
