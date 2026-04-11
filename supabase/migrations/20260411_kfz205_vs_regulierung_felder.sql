-- KFZ-205: Fehlende VS-Regulierung Spalten fuer manuelle Eingabe
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS kuerzungs_betrag NUMERIC(10,2);
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vs_frist_bis TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS ruege_counter INT DEFAULT 0;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS schlussabrechnung_am TIMESTAMPTZ;
