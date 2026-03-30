ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS erinnerung_24h_gesendet BOOLEAN DEFAULT false;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS erinnerung_2h_gesendet BOOLEAN DEFAULT false;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS erinnerung_48h_docs_gesendet BOOLEAN DEFAULT false;
