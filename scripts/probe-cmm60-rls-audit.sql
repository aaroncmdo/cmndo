-- CMM-60 Schritt-2 RLS-Audit: is_sv_for_claim + Abhaengigkeiten von faelle.sv_id.
SELECT json_build_object(
  'is_sv_for_claim_def', (
    SELECT pg_get_functiondef(p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='is_sv_for_claim'
  ),
  'is_sv_for_claim_grants', (
    SELECT json_agg(json_build_object('grantee', grantee, 'priv', privilege_type))
    FROM information_schema.role_routine_grants
    WHERE routine_schema='public' AND routine_name='is_sv_for_claim'
  ),
  'secdef_fns_referencing_faelle_sv_id', (
    SELECT json_agg(p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND pg_get_functiondef(p.oid) ILIKE '%faelle%sv_id%'
  ),
  'policies_referencing_sv_id_or_is_sv_for_claim', (
    SELECT json_agg(json_build_object(
      'table', tablename, 'policy', policyname, 'cmd', cmd,
      'roles', roles, 'using', qual, 'check', with_check))
    FROM pg_policies
    WHERE schemaname='public'
      AND (qual ILIKE '%is_sv_for_claim%' OR qual ILIKE '%sv_id%'
           OR with_check ILIKE '%is_sv_for_claim%' OR with_check ILIKE '%sv_id%')
  )
) AS audit;
