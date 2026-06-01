-- Unisone Termin-Engine Phase 1 / Task 6 (Security-Gegencheck-Nachzug)
-- Der Audit-Gegencheck fand: anon sauber, aber Supabase-Default gab `authenticated`
-- SELECT auf v_belegung. Default-Views umgehen RLS (kein security_invoker) -> ein
-- eingeloggter Nutzer koennte ALLE SV-Belegungen + bezug_ids lesen. Leak-Schutz:
--   1. security_invoker=true -> RLS der Basistabellen gilt auch bei kuenftigem Grant
--      (Repo-Konvention aar613_security_ddl_view_invoker_rls).
--   2. REVOKE anon+authenticated -> Phase 1 hat 0 Consumer; die Engine liest via
--      service_role (createAdminClient), das von den Grants unberuehrt bleibt.
ALTER VIEW public.v_belegung SET (security_invoker = true);
REVOKE ALL ON public.v_belegung FROM anon, authenticated;
