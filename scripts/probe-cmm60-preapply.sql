-- CMM-60 Schritt-1 Pre-Apply-Probe: Live-DB-Stand verifizieren bevor Migration laeuft.
SELECT chk, result FROM (
  SELECT 1 AS ord, 'claims.sv_id exists' AS chk,
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='claims' AND column_name='sv_id')::text AS result
  UNION ALL
  SELECT 2, 'migration 20260516174112 applied',
         EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260516174112')::text
  UNION ALL
  SELECT 3, 'trigger trg_sync_faelle_sv_id_to_claims exists',
         EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_sync_faelle_sv_id_to_claims')::text
  UNION ALL
  SELECT 4, 'faelle total', (SELECT count(*)::text FROM public.faelle)
  UNION ALL
  SELECT 5, 'faelle mit claim_id', (SELECT count(*)::text FROM public.faelle WHERE claim_id IS NOT NULL)
  UNION ALL
  SELECT 6, 'faelle mit sv_id', (SELECT count(*)::text FROM public.faelle WHERE sv_id IS NOT NULL)
  UNION ALL
  SELECT 7, 'faelle mit sv_id UND claim_id (Backfill-Erwartung)',
         (SELECT count(*)::text FROM public.faelle WHERE sv_id IS NOT NULL AND claim_id IS NOT NULL)
) q ORDER BY ord;
