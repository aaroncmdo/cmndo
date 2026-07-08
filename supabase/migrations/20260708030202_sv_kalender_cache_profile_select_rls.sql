-- Grund: sv_kalender_events_cache wurde auf profil-gekeyt umgestellt (SP1, assignee-generisch:
-- SV, Kundenbetreuer, ...). Der Sync-Cron schreibt profile_id (sv_id = NULL). Die bestehende
-- SELECT-RLS-Policy "sv_liest_eigene_cache_events" gated aber NUR auf sv_id
--   (sv_id IN (SELECT id FROM sachverstaendige WHERE profile_id = auth.uid()))
-- -> synchronisierte CalDAV/Google-Events (sv_id NULL) waren fuer den authentifizierten Nutzer
-- via RLS UNSICHTBAR (empirisch: 0 Zeilen), obwohl der profil-gekeyte Reader (createClient,
-- RLS-gated) sie per profile_id=auth.uid() matchte. Der Reader-Fix (#3865: .eq('profile_id'))
-- war deshalb wirkungslos — RLS blockte davor.
--
-- Fix: ADDITIVE zweite permissive SELECT-Policy. Erlaubt jedem authenticated-User seine EIGENEN
-- profil-gekeyten Rows (profile_id = auth.uid()). Die alte sv_id-Policy bleibt bestehen -> per
-- OR (mehrere permissive Policies) bleiben alte sv_id-gekeyte Rows (alter Cron) weiter sichtbar.
-- Rein additiv: kann keine bestehende Sichtbarkeit einschraenken. Schreibt weiterhin nur der
-- Service-Role-Sync (createAdminClient, RLS-bypass) -> INSERT/UPDATE/DELETE-Policies unberuehrt.
CREATE POLICY "profil_liest_eigene_cache_events"
ON public.sv_kalender_events_cache
FOR SELECT
TO authenticated
USING (profile_id = (SELECT auth.uid()));
