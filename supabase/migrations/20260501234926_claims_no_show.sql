-- Verpasster Termin auf Claim-Ebene tracken (Kunde-No-Show).
--
-- Trigger: kundeTerminVerlegungVorschlagen, wenn der alte Termin bereits
-- verstrichen war und der Kunde via "Neuen Termin vereinbaren" einen
-- neuen Slot bucht. Status auf gutachter_termine wird auf 'verpasst'
-- gesetzt, parallel inkrementieren wir hier die Counter auf claim-Ebene
-- damit Reporting/Admin sehen koennen wie oft ein Kunde nicht erschienen
-- ist.

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS kunde_no_show_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS letzter_no_show_am timestamptz;

COMMENT ON COLUMN public.claims.kunde_no_show_count IS
  'Anzahl der verpassten Besichtigungstermine des Kunden bei diesem Claim. '
  'Inkrementiert bei jedem als verpasst markierten Termin.';

COMMENT ON COLUMN public.claims.letzter_no_show_am IS
  'Zeitstempel des letzten verpassten Besichtigungstermins.';
