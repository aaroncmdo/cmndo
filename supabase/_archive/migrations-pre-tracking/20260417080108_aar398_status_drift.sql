-- AAR-398 Cluster 3: Status-Drift Fix
ALTER TABLE public.faelle DROP CONSTRAINT IF EXISTS faelle_nachbesichtigung_status_check;
ALTER TABLE public.faelle ALTER COLUMN nachbesichtigung_status DROP DEFAULT;

UPDATE public.faelle SET nachbesichtigung_status = CASE nachbesichtigung_status
  WHEN 'nicht_angefordert'    THEN 'nicht-angefordert'
  WHEN 'angefordert'          THEN 'angefordert'
  WHEN 'termin_gewaehlt'      THEN 'termin-gewaehlt'
  WHEN 'abgeschlossen'        THEN 'durchgefuehrt'
  WHEN 'ergebnis_eingegangen' THEN 'ergebnis-eingegangen'
  WHEN 'nicht-angefordert'    THEN 'nicht-angefordert'
  WHEN 'termin-gewaehlt'      THEN 'termin-gewaehlt'
  WHEN 'durchgefuehrt'        THEN 'durchgefuehrt'
  WHEN 'ergebnis-eingegangen' THEN 'ergebnis-eingegangen'
  ELSE 'nicht-angefordert'
END;

UPDATE public.faelle SET nachbesichtigung_status = 'nicht-angefordert'
  WHERE nachbesichtigung_status IS NULL;

ALTER TABLE public.faelle ALTER COLUMN nachbesichtigung_status SET DEFAULT 'nicht-angefordert';
ALTER TABLE public.faelle ADD CONSTRAINT faelle_nachbesichtigung_status_check
  CHECK (nachbesichtigung_status IN (
    'nicht-angefordert', 'angefordert', 'termin-gewaehlt',
    'durchgefuehrt', 'ergebnis-eingegangen'
  ));

ALTER TABLE public.faelle DROP CONSTRAINT IF EXISTS faelle_technische_stellungnahme_status_check;
ALTER TABLE public.faelle ALTER COLUMN technische_stellungnahme_status DROP DEFAULT;

UPDATE public.faelle SET technische_stellungnahme_status = CASE technische_stellungnahme_status
  WHEN 'nicht_benoetigt'   THEN 'nicht-angefordert'
  WHEN 'nicht-angefordert' THEN 'nicht-angefordert'
  WHEN 'beauftragt'        THEN 'beauftragt'
  WHEN 'hochgeladen'       THEN 'hochgeladen'
  WHEN 'freigegeben'       THEN 'freigegeben'
  WHEN 'abgelehnt'         THEN 'abgelehnt'
  ELSE 'nicht-angefordert'
END;

UPDATE public.faelle SET technische_stellungnahme_status = 'nicht-angefordert'
  WHERE technische_stellungnahme_status IS NULL;

ALTER TABLE public.faelle ALTER COLUMN technische_stellungnahme_status SET DEFAULT 'nicht-angefordert';
ALTER TABLE public.faelle ADD CONSTRAINT faelle_technische_stellungnahme_status_check
  CHECK (technische_stellungnahme_status IN (
    'nicht-angefordert', 'beauftragt', 'hochgeladen', 'freigegeben', 'abgelehnt'
  ));

-- Katalog-Rules: Freigeschaltet-Cond + Pflicht-Cond auf valide Werte
UPDATE public.dokument_katalog
SET freigeschaltet_wenn = '{"op":"in","field":"fall.technische_stellungnahme_status","value":["beauftragt","hochgeladen","freigegeben"]}'::jsonb
WHERE freigeschaltet_wenn::text LIKE '%technische_stellungnahme_status%in-bearbeitung%';

UPDATE public.dokument_katalog
SET pflicht_wenn = '{"op":"in","field":"fall.technische_stellungnahme_status","value":["beauftragt","hochgeladen","freigegeben"]}'::jsonb
WHERE pflicht_wenn::text LIKE '%technische_stellungnahme_status%in-bearbeitung%';;
