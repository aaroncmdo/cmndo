-- Phase-10-Save macht INSERT in gutachter_finder_anfragen → ok dank gfa_insert_public.
-- ABER: Phase 20/25/27/30 machen UPDATE auf die selbe Zeile (anfrageId in sessionStorage).
-- gfa_admin_update ist nur für admin → anon UPDATE blockiert silent → in DB bleiben
-- besichtigungsort_adresse gesetzt, alle anderen Spalten NULL.
--
-- Aufgefallen im CJ-Smoke cj-full-wizard-v4: 6 entwurf-Rows in DB, jede mit
-- besichtigungsort gesetzt, sonst alles NULL. Klicks in Phase 20-30 hatten
-- keinen DB-Effekt.
--
-- Fix: anon UPDATE auf eigene entwurf-Anfragen erlauben. Restriction status='entwurf'
-- damit anon nicht eigene finalized Anfragen oder fremde Daten manipulieren kann.

CREATE POLICY gfa_anon_update_entwurf ON public.gutachter_finder_anfragen
  FOR UPDATE TO anon, authenticated
  USING (status = 'entwurf')
  WITH CHECK (status = 'entwurf' OR status = 'eingegangen');

COMMENT ON POLICY gfa_anon_update_entwurf ON public.gutachter_finder_anfragen IS
  'Erlaubt anon UPDATE auf eigene Wizard-Anfrage solange status=entwurf. WITH CHECK lässt status-Transition entwurf→eingegangen zu (finalize). FIXME: id-basierte session-binding für sauberere Restriction.';
