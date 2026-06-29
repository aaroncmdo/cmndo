-- CI-Safety-Net-Helfer: kodifiziert den schema-weiten Leak-Scan (der v_claim_timeline +
-- v_gutachten_werte fand) als callable Funktion. Liefert alle definer-Views, die an app-Rollen
-- granted sind UND keinen bekannten Claim-Gate referenzieren = die #3250-Leak-Klasse.
-- CI (scripts/check-claim-view-rls.mjs) asserted: Ergebnis muss LEER sein.
CREATE OR REPLACE FUNCTION public.audit_ungated_definer_views()
 RETURNS TABLE(view_name text, app_grants text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT c.relname::text AS view_name,
    (SELECT string_agg(DISTINCT grantee, ',' ORDER BY grantee) FROM information_schema.role_table_grants g
       WHERE g.table_schema = 'public' AND g.table_name = c.relname AND g.privilege_type = 'SELECT'
         AND grantee IN ('anon','authenticated')) AS app_grants
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
    AND COALESCE(c.reloptions::text ILIKE '%security_invoker=true%', false) = false
    AND EXISTS (SELECT 1 FROM information_schema.role_table_grants g
         WHERE g.table_schema = 'public' AND g.table_name = c.relname AND g.privilege_type = 'SELECT'
           AND grantee IN ('anon','authenticated'))
    AND pg_get_viewdef(c.oid) NOT ILIKE '%claim_sichtbar%'
    AND pg_get_viewdef(c.oid) NOT ILIKE '%can_access_claim%'
    AND pg_get_viewdef(c.oid) NOT ILIKE '%is_claim_user_party%'
    AND pg_get_viewdef(c.oid) NOT ILIKE '%is_sv_for_claim%'
    AND pg_get_viewdef(c.oid) NOT ILIKE '%v_claim_base%'
  ORDER BY c.relname;
$function$;
REVOKE ALL ON FUNCTION public.audit_ungated_definer_views() FROM public;
GRANT EXECUTE ON FUNCTION public.audit_ungated_definer_views() TO service_role;
