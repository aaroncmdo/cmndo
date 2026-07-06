-- Claim-View-RLS-Checker (audit_ungated_definer_views): v_werkstatt_lead exemptieren.
-- Die statische Heuristik flaggt jede Definer-View mit app-Grant, deren Def keine der Claim-Gate-
-- Funktionen (claim_sichtbar / is_werkstatt_for_claim / v_claim_base ...) referenziert. v_werkstatt_lead
-- ist eine LEADS-View (KEIN Claim -> keine dieser Fn anwendbar), aber korrekt row-gegatet ueber
-- OWNERSHIP: werkstatt_id IN (SELECT id FROM werkstaetten WHERE user_id = auth.uid())
-- AND konvertiert_zu_claim_id IS NULL. Empirisch prod-verifiziert sicher (nobody-leak=0, anon=0,
-- identity-cross-compare 8 Rollen=0). Ohne Ausnahme flaggt die GETEILTE prod-RPC die View fuer JEDE
-- SQL-beruehrende PR (empirisch gg prod) -> Cross-PR-Build-Blocker. Fix an der Wurzel (prod-RPC),
-- damit ALLE Branches sofort gruen sind. Referenz: scripts/check-claim-view-rls.mjs, AGENTS §RLS.
CREATE OR REPLACE FUNCTION public.audit_ungated_definer_views()
 RETURNS TABLE(view_name text, app_grants text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.relname::text AS view_name,
    (SELECT string_agg(DISTINCT grantee, ',' ORDER BY grantee) FROM information_schema.role_table_grants g
       WHERE g.table_schema = 'public' AND g.table_name = c.relname AND g.privilege_type = 'SELECT'
         AND grantee IN ('anon','authenticated')) AS app_grants
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
    -- Bekannt-sichere Nicht-Claim-Ownership-View (Leads, s. Header) — kein Claim-Gate anwendbar:
    AND c.relname <> 'v_werkstatt_lead'
    AND COALESCE(c.reloptions::text ILIKE '%security_invoker=true%', false) = false
    AND EXISTS (SELECT 1 FROM information_schema.role_table_grants g
         WHERE g.table_schema = 'public' AND g.table_name = c.relname AND g.privilege_type = 'SELECT'
           AND grantee IN ('anon','authenticated'))
    AND pg_get_viewdef(c.oid) NOT ILIKE '%claim_sichtbar%'
    AND pg_get_viewdef(c.oid) NOT ILIKE '%can_access_claim%'
    AND pg_get_viewdef(c.oid) NOT ILIKE '%is_claim_user_party%'
    AND pg_get_viewdef(c.oid) NOT ILIKE '%is_sv_for_claim%'
    AND pg_get_viewdef(c.oid) NOT ILIKE '%is_werkstatt_for_claim%'
    AND pg_get_viewdef(c.oid) NOT ILIKE '%v_claim_base%'
  ORDER BY c.relname;
$function$;
