-- Bug-Audit 06.07. (Realtime-Hunt): admin_termine + pflichtdokumente werden von
-- Client-Komponenten via postgres_changes abonniert (RueckrufeRealtimeRefresher /
-- SvFallakteView-Feldmodus), waren aber NICHT in der supabase_realtime-Publication
-- -> die UI aktualisierte nur nach manuellem Reload.
--
-- Leak-safe: RLS ist auf beiden aktiv und gated korrekt (admin_termine =
-- admin/dispatch/assignee; pflichtdokumente = can_access_claim/owner/SV-own).
-- Realtime respektiert RLS -> Subscriber erhalten nur Zeilen, die sie ohnehin
-- SELECTen duerfen. REPLICA IDENTITY FULL, damit UPDATE/DELETE-Payloads die Filter-
-- + RLS-relevanten Spalten (typ, fall_id, claim_id) enthalten.
--
-- BEWUSST NICHT hinzugefuegt (brauchen erst separate Policy-Arbeit):
--   - gutachter_finder_anfragen: gfa_anon_select_recent_window liesse anon
--     Realtime-Broadcasts von Kunden-PII empfangen (Leak) -> erst Policy scopen.
--   - sv_live_location: nur own-SV-Policy, kein Staff-Read -> Dispatch-LiveOpsMap
--     bekaeme trotzdem nichts -> braucht erst eine Staff-SELECT-Policy.
ALTER TABLE public.admin_termine REPLICA IDENTITY FULL;
ALTER TABLE public.pflichtdokumente REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_termine;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pflichtdokumente;
