-- Wizard onboarding_felder.service_typ-Optionen sind 'komplett' und 'nur_gutachter',
-- aber CHECK-Constraint erlaubt nur 'vollstaendig'/'nur_gutachten'. Beim Finalize würde
-- INSERT/UPDATE regulierungs_modus='komplett' fallen mit 23514.
-- Aufgefallen im CJ-Smoke (cj-full-wizard-v4 DB-Inspektion).
--
-- Fix: CHECK erweitern um beide Wizard-Werte. Alte werden für historische Zeilen
-- weiter zugelassen damit kein Backfill nötig ist.

ALTER TABLE public.gutachter_finder_anfragen
  DROP CONSTRAINT IF EXISTS gutachter_finder_anfragen_regulierungs_modus_check;

ALTER TABLE public.gutachter_finder_anfragen
  ADD CONSTRAINT gutachter_finder_anfragen_regulierungs_modus_check
  CHECK (regulierungs_modus IS NULL OR regulierungs_modus IN ('komplett', 'nur_gutachter', 'vollstaendig', 'nur_gutachten'));;
