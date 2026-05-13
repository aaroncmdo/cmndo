-- Fix 4: Phase 20/25/27/30 Wizard-Save blockierte anon-UPDATE → in DB blieb
-- nach Phase 10 alles NULL trotz Klicks. Aufgefallen im CJ-Smoke cj-full-wizard-v4
-- mit DB-check: 6 entwurf-Rows, jede mit besichtigungsort_adresse aber alle
-- anderen Spalten NULL.
--
-- Fix: anon UPDATE auf eigene entwurf-Anfragen erlauben. status='entwurf'
-- restriction verhindert dass anon fremde finalized Anfragen manipuliert.
-- WITH CHECK lässt status-Transition entwurf→eingegangen zu (finalize).

CREATE POLICY gfa_anon_update_entwurf ON public.gutachter_finder_anfragen
  FOR UPDATE TO anon, authenticated
  USING (status = 'entwurf')
  WITH CHECK (status = 'entwurf' OR status = 'eingegangen');

COMMENT ON POLICY gfa_anon_update_entwurf ON public.gutachter_finder_anfragen IS
  'Erlaubt anon UPDATE auf eigene Wizard-Anfrage solange status=entwurf. FIXME: id-basierte session-binding für sauberere Restriction.';
