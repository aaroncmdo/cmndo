-- AAR-630: 7 Lead-Spalten die beim convertLeadToFall verloren gehen weil
-- sie kein Pendant auf faelle haben. Typen 1:1 kopiert aus leads (DB-Query
-- 2026-04-20) damit der Convert-Copy ohne Cast laeuft.
--
-- - fahrerflucht, auslandskennzeichen: Auto-Flags aus gegner-kz-flags.ts
-- - polizeibericht_status, zb1_status: Upload-Workflow-Status (Text-Enum)
-- - unfall_uhrzeit: leads hat das als text (nicht time), uebernehmen
-- - unfallort_lat/lng: numeric (fuer spaetere Kartenkomponenten im SV/Admin)

ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS fahrerflucht boolean;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS auslandskennzeichen boolean;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS polizeibericht_status text;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS zb1_status text;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS unfall_uhrzeit text;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS unfallort_lat numeric;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS unfallort_lng numeric;

COMMENT ON COLUMN public.faelle.fahrerflucht IS 'AAR-630/AAR-135: Auto-Flag aus gegner-kz-flags.ts.';
COMMENT ON COLUMN public.faelle.auslandskennzeichen IS 'AAR-630/AAR-135: Auto-Flag fuer Gruene-Karte-Workflow.';
COMMENT ON COLUMN public.faelle.polizeibericht_status IS 'AAR-630/AAR-263: Upload-Workflow-Status.';
COMMENT ON COLUMN public.faelle.zb1_status IS 'AAR-630/AAR-182: Upload-Workflow-Status.';
COMMENT ON COLUMN public.faelle.unfall_uhrzeit IS 'AAR-630: leads-Typ ist text, uebernommen.';
COMMENT ON COLUMN public.faelle.unfallort_lat IS 'AAR-630: Lat-Koordinate fuer Kartenkomponente.';
COMMENT ON COLUMN public.faelle.unfallort_lng IS 'AAR-630: Lng-Koordinate.';
