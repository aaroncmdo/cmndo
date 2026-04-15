-- AAR-208: hsn/tsn auf leads für ZB1-OCR-Extraktion.
-- Andere Halter-Spalten + erstzulassung + fin existieren bereits.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS hsn TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tsn TEXT;

COMMENT ON COLUMN leads.hsn IS 'AAR-208: Herstellerschlüsselnummer aus ZB1-OCR (4 Ziffern)';
COMMENT ON COLUMN leads.tsn IS 'AAR-208: Typschlüsselnummer aus ZB1-OCR (3 alphanumerisch)';
