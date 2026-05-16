-- CMM-60 Schritt-2 Post-Apply-Verifikation.
SELECT chk, result FROM (
  SELECT 1 AS ord, 'migration 20260516180053 applied' AS chk,
         EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260516180053')::text AS result
  UNION ALL
  SELECT 2, 'is_sv_for_claim jetzt claims.sv_id-basiert',
         (pg_get_functiondef((SELECT oid FROM pg_proc WHERE proname='is_sv_for_claim' LIMIT 1))
            ILIKE '%FROM claims%' AND
          pg_get_functiondef((SELECT oid FROM pg_proc WHERE proname='is_sv_for_claim' LIMIT 1))
            NOT ILIKE '%FROM faelle%')::text
  UNION ALL
  SELECT 3, 'GRANT EXECUTE an authenticated + service_role',
         ((SELECT count(*) FROM information_schema.role_routine_grants
           WHERE routine_name='is_sv_for_claim' AND grantee IN ('authenticated','service_role')
             AND privilege_type='EXECUTE') = 2)::text
  UNION ALL
  SELECT 4, 'trigger feuert jetzt auf INSERT UND UPDATE',
         (SELECT ((tgtype & 4 = 4) AND (tgtype & 16 = 16))::text
          FROM pg_trigger WHERE tgname='trg_sync_faelle_sv_id_to_claims')
  UNION ALL
  SELECT 5, 'cp_sv_assigned_insert nutzt is_sv_for_claim',
         (SELECT (with_check ILIKE '%is_sv_for_claim%')::text
          FROM pg_policies WHERE policyname='cp_sv_assigned_insert')
  UNION ALL
  SELECT 6, 'claims.sv_id Befuellung',
         (SELECT count(*)::text FROM public.claims WHERE sv_id IS NOT NULL)
  UNION ALL
  SELECT 7, 'claims.sv_id Mismatch vs faelle.sv_id',
         (SELECT count(*)::text FROM public.claims c JOIN public.faelle f ON f.claim_id=c.id
          WHERE c.sv_id IS DISTINCT FROM f.sv_id)
) q ORDER BY ord;
