-- AAR-129: Organisationen bekommen eigene Geo-Felder statt Hack ueber HAN-SV
ALTER TABLE organisationen
  ADD COLUMN IF NOT EXISTS standort_lat numeric,
  ADD COLUMN IF NOT EXISTS standort_lng numeric,
  ADD COLUMN IF NOT EXISTS standort_adresse text,
  ADD COLUMN IF NOT EXISTS standort_plz text,
  ADD COLUMN IF NOT EXISTS standort_place_id text,
  ADD COLUMN IF NOT EXISTS einsatzgebiet_km numeric,
  ADD COLUMN IF NOT EXISTS isochrone_polygon jsonb;

-- Backfill: bestehende einsatzgebiet_zentrum_lat/lng in standort_lat/lng uebernehmen
UPDATE organisationen
SET standort_lat = einsatzgebiet_zentrum_lat,
    standort_lng = einsatzgebiet_zentrum_lng
WHERE standort_lat IS NULL AND einsatzgebiet_zentrum_lat IS NOT NULL;

-- Backfill einsatzgebiet_km aus bestehendem einsatzgebiet_radius_km
UPDATE organisationen
SET einsatzgebiet_km = einsatzgebiet_radius_km
WHERE einsatzgebiet_km IS NULL AND einsatzgebiet_radius_km IS NOT NULL;

-- Anschrift ist die einzige bestehende Adress-Spalte — ohne Place-ID/PLZ
-- Follow-up: einmaliger Script-Run koennte PLZ aus anschrift extrahieren
UPDATE organisationen
SET standort_adresse = anschrift
WHERE standort_adresse IS NULL AND anschrift IS NOT NULL;

-- Die alten einsatzgebiet_zentrum_lat/lng + einsatzgebiet_radius_km NICHT loeschen
-- Parallel bis Code-Migration verifiziert ist.;
