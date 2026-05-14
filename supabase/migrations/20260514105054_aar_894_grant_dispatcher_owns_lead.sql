-- AAR-894: dispatcher_owns_lead() EXECUTE-Grant für authenticated wiederherstellen.
--
-- Ursprünglich gesetzt in cmm19_fix_rls_recursion_v3 (27.04.2026). Aktueller
-- DB-Stand: nur postgres + service_role haben EXECUTE — die `authenticated`-Rolle
-- ist via Default-ACL geflogen (vermutlich bei einem CREATE OR REPLACE FUNCTION
-- ohne erneuten GRANT, oder einem REVOKE FROM PUBLIC der nicht im Repo steckt).
--
-- Symptom (gefunden beim Browser-Smoke der Dispatcher-Karte):
--   SELECT auf `leads` als dispatch-Rolle → 42501 "permission denied for
--   function dispatcher_owns_lead". Ursache: leads_kanzlei_kb_select_consolidated
--   joint claims, dessen claims_kunde_sv_dispatch_select_consolidated-Policy
--   ruft `is_dispatcher() AND dispatcher_owns_lead(lead_id)` auf. Bei dispatch-
--   Usern returnt is_dispatcher() true → Postgres versucht dispatcher_owns_lead
--   zu callen → 42501.
--
-- Function ist SECURITY DEFINER und prüft nur Ownership — Grant an
-- authenticated ist safe (Funktion kontrolliert selbst was sie zurückgibt).

GRANT EXECUTE ON FUNCTION public.dispatcher_owns_lead(uuid) TO authenticated;
