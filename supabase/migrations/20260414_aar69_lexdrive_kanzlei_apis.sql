-- AAR-69: LexDrive-Kanzlei-API Felder + lexdrive_ocr-Speicher (vom Webhook-Handler verwendet)
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vollmacht_geprueft_am TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vollmacht_geprueft_von TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vollmacht_pruefung_status TEXT
  CHECK (vollmacht_pruefung_status IN ('akzeptiert','abgelehnt','nachfrage'));
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vollmacht_pruefung_begruendung TEXT;

-- LexDrive OCR-Daten Cache (vom Webhook befuellt)
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS lexdrive_ocr_data JSONB;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS lexdrive_ocr_received_at TIMESTAMPTZ;
