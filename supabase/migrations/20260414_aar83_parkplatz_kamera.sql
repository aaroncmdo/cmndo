-- AAR-83: Parkplatz-Kamera-Check vor Disqualifikation
ALTER TABLE leads ADD COLUMN IF NOT EXISTS parkplatz_kamera BOOLEAN;
