-- Korrektur zu sv_lead_upsert_revoke_public: die EXECUTE-Privilegien fuer anon/authenticated
-- stammen aus EXPLIZITEN Grants (Supabase ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ... TO anon,
-- authenticated, service_role), nicht aus PUBLIC. proacl = {postgres=X/postgres, anon=X/postgres,
-- authenticated=X/postgres, service_role=X/postgres}. REVOKE FROM PUBLIC war daher ein No-op.
-- Wirksamer Entzug des unauthentifizierten Schreibwegs: REVOKE von anon + authenticated.
-- service_role behaelt seinen expliziten Grant (kanonischer Admin-Wrapper schreibt weiter).
-- Verifiziert nach Apply: has_function_privilege(anon|authenticated)=false, service_role=true.
REVOKE EXECUTE ON FUNCTION public.sv_lead_upsert(jsonb) FROM anon, authenticated;
