-- Korrektur zu 20260707135509: SET LOCAL ROLE ist in SECURITY DEFINER verboten (42501).
-- Statt die anon-Sicht in der RPC zu messen, enumeriert die RPC nur die anon-lesbaren
-- Views/Matviews; der CI-Guard (scripts/check-anon-exposure.mjs) testet jede via echtem
-- anon-REST-Client (definitiver Ground-Truth-anon-Zugriff, kein set_config-Bypass-Risiko
-- — set_config zeigte empirisch v_offene_anfragen=70 wo echtes anon 0 sieht).
DROP FUNCTION IF EXISTS public.audit_anon_view_leaks();

CREATE OR REPLACE FUNCTION public.audit_anon_readable_views()
 RETURNS TABLE(view_name text, is_matview boolean, security_invoker boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT c.relname::text, (c.relkind = 'm'),
         COALESCE(c.reloptions::text ILIKE '%security_invoker=true%', false)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
    AND has_table_privilege('anon', c.oid, 'SELECT')
  ORDER BY c.relname;
$function$;
REVOKE ALL ON FUNCTION public.audit_anon_readable_views() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_anon_readable_views() TO service_role;
