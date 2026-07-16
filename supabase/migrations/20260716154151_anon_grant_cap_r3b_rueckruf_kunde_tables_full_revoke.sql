-- Anon-Grant-Cap Runde 3b (Task B): calls + anruf_log + termine - anon-SELECT Full-Revoke.
--
-- Kontext: systematischer Grant-Audit 15./16.07. (AGENTS.md Anon-Grant-Gate,
-- Baseline 10 -> 6: calls.notiz, anruf_log.notiz, termine.notiz, termine.ergebnis_notiz).
-- Alle latent: anruf_log/calls-Policies staff-gated via auth.uid(); termine hat fuer
-- anon GAR KEINE SELECT-Policy (termine__b1sel_au ist {authenticated}-only).
--
-- Consumer-Audit 16.07. (staging df2510d32):
--   calls: lib/fall/communication-timeline, copilot/post-call, aircall/bridge (db=Admin),
--     call-actions, api/aircall/webhook (createAdminClient Z.2/28) - service/authenticated.
--   anruf_log: nur dispatch/rueckrufe + RueckrufTerminPanel (authenticated Staff-UI).
--   termine: 5 Sites, alle Staff (mitarbeiter/performance, admin/kalender,
--     TageskalenderWidget, faelle/_actions) - der Kunde liest termine als authenticated
--     (Policy-Zweig kunde_user_id = auth.uid()); es existiert KEIN kunde-anon-Pfad
--     (die public Rueckruf-Flows schreiben seit AAR-637 in admin_termine via Admin-Client).
--   Die im Handoff vermuteten public-Flow-Reads (reservierungs-rueckruf/public-rueckruf)
--     laufen komplett ueber createAdminClient und beruehren calls/anruf_log gar nicht.
--
-- Realtime: termine ist zwar in der supabase_realtime-Publication, aber 0 Code-
-- Subscriber (kein postgres_changes auf termine); walrus prueft die SUBSCRIBER-Rolle,
-- ein anon-only-Cap ist davon unberuehrt (claims-Regression 20260714220455 kam vom
-- authenticated-Cap). can_access_claim (calls-Policy) = SECURITY DEFINER, beide
-- Zweige auth.uid()-gated. Keine Views/Embeds ueber den 3 Tabellen.
--
-- authenticated + service_role behalten ihre Grants unveraendert.
revoke select on public.calls from anon;
revoke select on public.anruf_log from anon;
revoke select on public.termine from anon;
