-- KFZ-78: Gutachter Losfahren + 5-Min Erinnerung
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS losfahren_erinnerung_gesendet BOOLEAN DEFAULT false;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS termin_erinnerung_5min_gesendet BOOLEAN DEFAULT false;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS geschaetzte_fahrzeit_min INTEGER;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS geschaetzte_fahrdistanz_km DECIMAL(6,1);
