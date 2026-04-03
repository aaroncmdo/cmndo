-- BUG-52: Drei Adressen — Besichtigungsort, Unfallort, Kundenadresse
-- Besichtigungsort (KRITISCH für Dispatching)
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS besichtigungsort_adresse TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS besichtigungsort_lat DECIMAL(10,7);
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS besichtigungsort_lng DECIMAL(10,7);
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS besichtigungsort_place_id TEXT;

-- Unfallort + Unfalldatum auf Leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unfallort TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unfallort_lat DECIMAL(10,7);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unfallort_lng DECIMAL(10,7);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unfalldatum DATE;

-- Kundenadresse
ALTER TABLE leads ADD COLUMN IF NOT EXISTS kunde_adresse TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS kunde_lat DECIMAL(10,7);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS kunde_lng DECIMAL(10,7);
