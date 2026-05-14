ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS hsn text;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS tsn text;
COMMENT ON COLUMN public.faelle.hsn IS 'AAR-576: Herstellerschlüsselnummer aus ZB1-OCR (oder Admin-Inline-Edit). Blocker für DAT-API.';
COMMENT ON COLUMN public.faelle.tsn IS 'AAR-576: Typschlüsselnummer aus ZB1-OCR (oder Admin-Inline-Edit). Blocker für DAT-API.';;
