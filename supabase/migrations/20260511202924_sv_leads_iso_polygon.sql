-- 2026-05-11: sv_leads bekommt isochrone_polygon + paket_umkreis_km
ALTER TABLE public.sv_leads
  ADD COLUMN IF NOT EXISTS isochrone_polygon JSONB,
  ADD COLUMN IF NOT EXISTS paket_umkreis_km INTEGER DEFAULT 25;
