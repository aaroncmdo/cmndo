-- Wizard service_typ liefert 'komplett'/'nur_gutachter', CHECK erlaubte nur
-- 'vollstaendig'/'nur_gutachten'. Beim Finalize würde 23514 fallen.
-- Aufgefallen im CJ-Smoke cj-full-wizard-v4 DB-Inspektion.

ALTER TABLE public.gutachter_finder_anfragen
  DROP CONSTRAINT IF EXISTS gutachter_finder_anfragen_regulierungs_modus_check;

ALTER TABLE public.gutachter_finder_anfragen
  ADD CONSTRAINT gutachter_finder_anfragen_regulierungs_modus_check
  CHECK (regulierungs_modus IS NULL OR regulierungs_modus IN ('komplett', 'nur_gutachter', 'vollstaendig', 'nur_gutachten'));
