-- CMM-60 Schritt-2 Pre-Apply: Stand vor dem Apply verifizieren.
SELECT chk, result FROM (
  SELECT 1 AS ord, 'migration 20260516180053 applied' AS chk,
         EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260516180053')::text AS result
  UNION ALL
  SELECT 2, 'is_sv_for_claim noch faelle-basiert',
         (pg_get_functiondef((SELECT oid FROM pg_proc WHERE proname='is_sv_for_claim' LIMIT 1)) ILIKE '%FROM faelle%')::text
  UNION ALL
  SELECT 3, 'trigger feuert (noch) nur auf UPDATE',
         (SELECT ((tgtype & 4 = 0) AND (tgtype & 16 = 16))::text
          FROM pg_trigger WHERE tgname='trg_sync_faelle_sv_id_to_claims')
  UNION ALL
  SELECT 4, 'claims.sv_id Befuellung aktuell',
         (SELECT count(*)::text FROM public.claims WHERE sv_id IS NOT NULL)
  UNION ALL
  SELECT 5, 'claims.sv_id Mismatch vs faelle.sv_id',
         (SELECT count(*)::text FROM public.claims c JOIN public.faelle f ON f.claim_id=c.id
          WHERE c.sv_id IS DISTINCT FROM f.sv_id)
) q ORDER BY ord;
