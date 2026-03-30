-- KFZ-14: OCR Gutachten-Auslesung + Kunden-Auszahlung

-- Add detailed damage assessment fields extracted from gutachten PDF
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS schadenhoehe_netto DECIMAL(10,2);
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS wiederbeschaffungswert DECIMAL(10,2);
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS restwert DECIMAL(10,2);
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS nutzungsausfall_tage INTEGER;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS nutzungsausfall_tagessatz DECIMAL(10,2);
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS reparaturdauer_tage INTEGER;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS totalschaden BOOLEAN DEFAULT false;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS fin_vin TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS gutachter_honorar DECIMAL(10,2);
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS ocr_extrahiert_am TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS ocr_rohdaten JSONB;
