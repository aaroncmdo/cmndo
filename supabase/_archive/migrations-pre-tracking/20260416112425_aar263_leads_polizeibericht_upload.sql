-- AAR-263 W0: Polizeibericht-Upload-Spalten (1:1 Pattern wie ZB1, additiv)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS polizeibericht_token TEXT,
  ADD COLUMN IF NOT EXISTS polizeibericht_status TEXT,
  ADD COLUMN IF NOT EXISTS polizeibericht_gesendet_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS polizeibericht_hochgeladen_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS polizeibericht_url TEXT,
  ADD COLUMN IF NOT EXISTS polizeibericht_ocr_daten JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name='leads' AND constraint_name='leads_polizeibericht_status_check'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_polizeibericht_status_check
      CHECK (polizeibericht_status IS NULL OR polizeibericht_status IN ('gesendet','geoeffnet','hochgeladen','fehlgeschlagen','abgelehnt'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS leads_polizeibericht_token_idx ON leads(polizeibericht_token)
  WHERE polizeibericht_token IS NOT NULL;

COMMENT ON COLUMN leads.polizeibericht_status IS 'AAR-263: gesendet|geoeffnet|hochgeladen|fehlgeschlagen|abgelehnt — analog zb1_status';
COMMENT ON COLUMN leads.polizeibericht_url IS 'AAR-263: Public URL des polizeilichen Unfallmitteilungs-Fotos in Storage';;
