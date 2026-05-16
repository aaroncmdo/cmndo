-- CMM-60 Schritt-1 Post-Apply-Verifikation.
SELECT chk, result FROM (
  SELECT 1 AS ord, 'claims.sv_id exists' AS chk,
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='claims' AND column_name='sv_id')::text AS result
  UNION ALL
  SELECT 2, 'migration 20260516174112 applied',
         EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260516174112')::text
  UNION ALL
  SELECT 3, 'index idx_claims_sv_id exists',
         EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_claims_sv_id')::text
  UNION ALL
  SELECT 4, 'trigger trg_sync_faelle_sv_id_to_claims exists',
         EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_sync_faelle_sv_id_to_claims')::text
  UNION ALL
  SELECT 5, 'FK claims.sv_id -> sachverstaendige',
         EXISTS (SELECT 1 FROM information_schema.referential_constraints rc
                 JOIN information_schema.key_column_usage k ON k.constraint_name=rc.constraint_name
                 WHERE k.table_name='claims' AND k.column_name='sv_id')::text
  UNION ALL
  SELECT 6, 'claims mit sv_id (Backfill, Erwartung 21)',
         (SELECT count(*)::text FROM public.claims WHERE sv_id IS NOT NULL)
  UNION ALL
  SELECT 7, 'claims.sv_id stimmt mit faelle.sv_id ueberein (Mismatches)',
         (SELECT count(*)::text FROM public.claims c JOIN public.faelle f ON f.claim_id=c.id
          WHERE c.sv_id IS DISTINCT FROM f.sv_id)
) q ORDER BY ord;
