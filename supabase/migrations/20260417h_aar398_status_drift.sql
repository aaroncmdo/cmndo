-- AAR-398 Cluster 3: Status-Drift Fix
--
-- Problem: Migration 20260411_kfz202b_fehlende_spalten.sql hat
-- faelle.nachbesichtigung_status mit DEFAULT 'nicht_angefordert' (Underscore)
-- und faelle.technische_stellungnahme_status mit DEFAULT 'nicht_benoetigt' (Underscore)
-- eingeführt. Die Cards im SV-Portal (NachbesichtigungCard, StellungnahmeCard)
-- prüfen aber gegen 'nicht-angefordert' (Bindestrich). Folge:
--
--   if (!status || status === 'nicht-angefordert') return null
--
-- greift nie — Cards rendern auf JEDEM Fall fälschlich als „aktiv", obwohl
-- der Default-Zustand „nicht gesetzt" ist. Screenshot aus CLM-20260416-004
-- zeigt genau diesen Bug.
--
-- Fix: DB auf Bindestriche-Convention normalisieren (konsistent mit
-- lib/faelle/state-machine.ts → 'zahlung-eingegangen', 'nachbesichtigung-laeuft'
-- etc.) und nicht_benoetigt ↔ nicht_angefordert zu einem einheitlichen
-- nicht-angefordert zusammenführen.

BEGIN;

-- ─── 1. Nachbesichtigung ────────────────────────────────────────────────
-- Alte CHECK: ('nicht_angefordert','angefordert','termin_gewaehlt','abgeschlossen')
-- Neue CHECK: ('nicht-angefordert','angefordert','termin-gewaehlt','durchgefuehrt','ergebnis-eingegangen')
--   'abgeschlossen' → 'durchgefuehrt' (NachbesichtigungCard vergleicht schon gegen 'durchgefuehrt')
--   'ergebnis-eingegangen' NEU (lexdrive process-event schreibt es, war bisher CHECK-Verletzung)

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

-- ─── 2. Technische Stellungnahme ────────────────────────────────────────
-- Alte CHECK: ('nicht_benoetigt','beauftragt','hochgeladen','freigegeben','abgelehnt')
-- Neue CHECK: ('nicht-angefordert','beauftragt','hochgeladen','freigegeben','abgelehnt')
--   'nicht_benoetigt' → 'nicht-angefordert' (vereinheitlicht mit Nachbesichtigung)

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

-- ─── 3. Katalog-Rules angleichen ─────────────────────────────────────────
-- Der Seed 20260417_aar321_dokument_katalog_seed.sql hat Rule-Werte wie
-- 'in-bearbeitung' und 'abgeschlossen' für technische_stellungnahme_status
-- vorgesehen, die es im CHECK nie gab. Wir schreiben die Rules um auf
-- tatsächlich vorhandene States, damit der Evaluator die Slots jetzt auch
-- wirklich freischaltet.

UPDATE public.dokument_katalog
SET freigeschaltet_wenn = '{"op":"in","field":"fall.technische_stellungnahme_status","value":["beauftragt","hochgeladen","freigegeben"]}'::jsonb
WHERE freigeschaltet_wenn::text LIKE '%technische_stellungnahme_status%in-bearbeitung%';

UPDATE public.dokument_katalog
SET pflicht_wenn = '{"op":"in","field":"fall.technische_stellungnahme_status","value":["beauftragt","hochgeladen","freigegeben"]}'::jsonb
WHERE pflicht_wenn::text LIKE '%technische_stellungnahme_status%in-bearbeitung%';

COMMIT;
