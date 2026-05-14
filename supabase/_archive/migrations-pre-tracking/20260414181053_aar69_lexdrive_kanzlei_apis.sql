ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vollmacht_geprueft_am TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vollmacht_geprueft_von TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vollmacht_pruefung_status TEXT
  CHECK (vollmacht_pruefung_status IN ('akzeptiert','abgelehnt','nachfrage'));
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vollmacht_pruefung_begruendung TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS lexdrive_ocr_data JSONB;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS lexdrive_ocr_received_at TIMESTAMPTZ;;
