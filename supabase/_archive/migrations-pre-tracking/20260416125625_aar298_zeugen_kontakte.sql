-- AAR-298: Zeugen-Kontaktdaten als JSONB-Array auf leads + faelle
-- Format: [{ name, telefon, email?, notiz? }, ...]
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zeugen_kontakte JSONB DEFAULT NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS zeugen_kontakte JSONB DEFAULT NULL;

COMMENT ON COLUMN leads.zeugen_kontakte IS 'AAR-298: Array von Zeugen-Kontaktdaten [{name, telefon, email?, notiz?}]';
COMMENT ON COLUMN faelle.zeugen_kontakte IS 'AAR-298: Array von Zeugen-Kontaktdaten — kopiert von lead.zeugen_kontakte';;
