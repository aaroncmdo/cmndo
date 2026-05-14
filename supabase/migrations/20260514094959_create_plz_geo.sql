-- AAR-894: PLZ→Geo-Centroid Lookup für Dispatcher-Karte v1.
-- Quelle: zauberware/postal-codes-json-xml-csv (BSD). Seed via scripts/seed-plz-geo.mjs.
-- Read-only für alle authenticated Nutzer. Keine Inserts/Updates aus dem App-Code.

CREATE TABLE IF NOT EXISTS public.plz_geo (
  plz text PRIMARY KEY,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  ort text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plz_geo_lat_lng_idx ON public.plz_geo (lat, lng);

ALTER TABLE public.plz_geo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plz_geo_read_authenticated"
  ON public.plz_geo
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.plz_geo IS
  'PLZ→Centroid Lookup für Karten-Fallback wenn leads keine eigene Geo haben. AAR-894.';
