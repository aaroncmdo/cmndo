-- KFZ-120: Admin kann Fallakte löschen und deaktivieren
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS ist_aktiv BOOLEAN DEFAULT true;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS deaktiviert_am TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS deaktiviert_grund TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS deaktiviert_notiz TEXT;

-- Index für aktive/deaktivierte Filterung
CREATE INDEX IF NOT EXISTS idx_faelle_ist_aktiv ON faelle(ist_aktiv);
