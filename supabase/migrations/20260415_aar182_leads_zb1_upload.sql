-- AAR-182: ZB1-Upload-Tracking auf leads.
-- Der Dispatcher triggert in Phase 4 einen WA/SMS/Email-Versand, der Kunde
-- antwortet mit Foto → Twilio-Inbound matcht via Telefon + zb1_status
-- 'gesendet' → OCR → Felder werden auf leads geschrieben.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS zb1_token TEXT UNIQUE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zb1_status TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zb1_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zb1_ocr_daten JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zb1_gesendet_am TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zb1_hochgeladen_am TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_zb1_status_check'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_zb1_status_check
      CHECK (zb1_status IS NULL OR zb1_status = ANY (ARRAY[
        'ausstehend'::text,
        'gesendet'::text,
        'geoeffnet'::text,
        'hochgeladen'::text,
        'fehlgeschlagen'::text
      ]));
  END IF;
END $$;

COMMENT ON COLUMN leads.zb1_status IS
  'AAR-182: ausstehend / gesendet / geoeffnet / hochgeladen / fehlgeschlagen';
COMMENT ON COLUMN leads.zb1_ocr_daten IS
  'AAR-182: Extrahierte Felder aus Google Vision + Rohtext';

CREATE INDEX IF NOT EXISTS idx_leads_zb1_token ON leads(zb1_token) WHERE zb1_token IS NOT NULL;
