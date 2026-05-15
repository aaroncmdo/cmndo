-- AAR-921 — RPC für check-rls-function-grants.mjs.
--
-- Liefert pro SECDEF-Function in `public`, die in pg_policies referenziert ist,
-- den Grant-Status für authenticated + service_role und die Anzahl Policy-Refs.
-- Wird vom CI-Pre-Build-Step in .github/workflows/ci.yml aufgerufen.
--
-- Idempotent: CREATE OR REPLACE FUNCTION. Re-runnable.
-- SECURITY DEFINER damit das Script mit `anon`/`authenticated` Key nicht arbeiten
-- muss — Service-Role-Key (CI-Secret) callt direkt.

CREATE OR REPLACE FUNCTION public.audit_rls_function_grants()
RETURNS TABLE (
  proname text,
  fn_sig text,
  auth_exec boolean,
  svc_exec boolean,
  policy_refs bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH secdef AS (
    SELECT
      p.oid,
      p.proname::text AS proname,
      (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text AS fn_sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  ),
  refs AS (
    SELECT DISTINCT s.oid, s.proname, s.fn_sig
    FROM pg_policies pol
    CROSS JOIN secdef s
    WHERE
      (pol.qual       IS NOT NULL AND pol.qual       LIKE '%' || s.proname || '(%')
      OR (pol.with_check IS NOT NULL AND pol.with_check LIKE '%' || s.proname || '(%')
  )
  SELECT
    r.proname,
    r.fn_sig,
    has_function_privilege('authenticated', r.oid, 'EXECUTE') AS auth_exec,
    has_function_privilege('service_role',  r.oid, 'EXECUTE') AS svc_exec,
    (SELECT count(*) FROM pg_policies pol
       WHERE (pol.qual       LIKE '%' || r.proname || '(%')
          OR (pol.with_check LIKE '%' || r.proname || '(%')) AS policy_refs
  FROM refs r
  ORDER BY r.proname;
$$;

-- Nur service_role darf den Audit ausführen — CI nutzt Service-Role-Key.
REVOKE ALL ON FUNCTION public.audit_rls_function_grants() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_rls_function_grants() FROM anon;
REVOKE ALL ON FUNCTION public.audit_rls_function_grants() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.audit_rls_function_grants() TO service_role;

COMMENT ON FUNCTION public.audit_rls_function_grants() IS
  'AAR-921 RLS-Drift-Audit: liefert SECDEF-Functions in pg_policies + EXECUTE-Grant-Status. Wird von scripts/check-rls-function-grants.mjs in CI gecallt.';
