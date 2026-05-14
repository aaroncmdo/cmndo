-- AAR-894: plz_geo Schema-Komplettierung — fügt fehlende Spalten ort + created_at hinzu.
-- Hintergrund: plz_geo wurde von einem parallelen Setup ohne diese Spalten angelegt.
-- Idempotent (IF NOT EXISTS), bricht keine bestehenden 404 Zeilen.

ALTER TABLE public.plz_geo
  ADD COLUMN IF NOT EXISTS ort text;

ALTER TABLE public.plz_geo
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS plz_geo_lat_lng_idx ON public.plz_geo (lat, lng);
