-- Treffpunkt-Notiz zum Besichtigungsort (z.B. "Bitte am Hintereingang klingeln").
-- Getrennt von besichtigungsort_adresse damit die strukturierte Adresse sauber bleibt.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS besichtigungsort_notiz text;

ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS besichtigungsort_adresse text,
  ADD COLUMN IF NOT EXISTS besichtigungsort_lat numeric,
  ADD COLUMN IF NOT EXISTS besichtigungsort_lng numeric,
  ADD COLUMN IF NOT EXISTS besichtigungsort_place_id text,
  ADD COLUMN IF NOT EXISTS besichtigungsort_notiz text;
