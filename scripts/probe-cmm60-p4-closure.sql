-- CMM-60 Phase-4 Closure-Verifikation — Struktur (ausserhalb Auth-Kontext).
SELECT chk, result FROM (
  SELECT 1 AS ord, 'v_claim_sv security_invoker NICHT mehr aktiv' AS chk,
    (NOT COALESCE(
      (SELECT (reloptions @> ARRAY['security_invoker=true'])
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname='v_claim_sv'), false))::text AS result
  UNION ALL
  SELECT 2, 'v_claim_sv Owner = postgres',
    ((SELECT pg_get_userbyid(c.relowner)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='v_claim_sv') = 'postgres')::text
  UNION ALL
  SELECT 3, 'is_sv_for_claim nicht mehr in claims-SELECT-Policy',
    (NOT (SELECT qual ILIKE '%is_sv_for_claim%'
          FROM pg_policies
          WHERE tablename='claims'
            AND policyname='claims_kunde_sv_dispatch_select_consolidated'))::text
  UNION ALL
  SELECT 4, 'is_sv_for_claim-Funktion existiert weiter',
    EXISTS(SELECT 1 FROM pg_proc WHERE proname='is_sv_for_claim')::text
) q ORDER BY ord;
