-- Verpasster Termin auf Claim-Ebene tracken — SV-Seite (Sachverstaendiger
-- ist nicht erschienen). Komplementaer zu kunde_no_show_count.
--
-- Trigger: Wenn ein Termin verstreicht und sv_angekommen_am IS NULL ist,
-- gilt der SV als nicht erschienen. Inkrementiert wird beim Verschieben
-- durch den Kunden (kundeTerminVerlegungVorschlagen) sowie via Cron als
-- Backstop fuer ungesehene Faelle. Mit Geo-Permission ist das vollkommen
-- automatisch — ohne Permission greift der manuelle Banner-Button als
-- Fallback.

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS sv_no_show_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS letzter_sv_no_show_am timestamptz;

COMMENT ON COLUMN public.claims.sv_no_show_count IS
  'Anzahl der Termine die der Sachverstaendige verpasst hat (sv_angekommen_am '
  'IS NULL und Termin verstrichen). Komplementaer zu kunde_no_show_count.';

COMMENT ON COLUMN public.claims.letzter_sv_no_show_am IS
  'Zeitstempel des letzten verpassten Termins durch den Sachverstaendigen.';
