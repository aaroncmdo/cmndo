-- AAR-576 (A2): HSN/TSN auf faelle retten — DAT-API-Blocker.
--
-- Lead extrahiert HSN + TSN aus dem Fahrzeugschein (zb1-OCR, lib/ocr/zb1-
-- parser.ts). Bislang kannte faelle nur fin_vin — HSN/TSN gingen beim Lead→
-- Fall-Handoff verloren. Das blockt AAR-473 (DAT-API), weil der DAT-Call
-- zwingend (hsn, tsn) erwartet.
--
-- Die Spalten sind Snapshot zum Zeitpunkt der Fall-Erzeugung. Admin-Inline-
-- Edit ist in der Allowlist (actions/stammdaten.ts) freigeschaltet, falls
-- der OCR-Wert korrigiert werden muss.

ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS hsn text;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS tsn text;

COMMENT ON COLUMN public.faelle.hsn IS 'AAR-576: Herstellerschlüsselnummer aus ZB1-OCR (oder Admin-Inline-Edit). Blocker für DAT-API.';
COMMENT ON COLUMN public.faelle.tsn IS 'AAR-576: Typschlüsselnummer aus ZB1-OCR (oder Admin-Inline-Edit). Blocker für DAT-API.';
