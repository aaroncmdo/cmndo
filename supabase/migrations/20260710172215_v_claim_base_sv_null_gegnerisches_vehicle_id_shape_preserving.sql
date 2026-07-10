-- Slice 3 (claims Normalisierung / CMM-49) -- T3 gegnerisches_vehicle_id: shape-preserving
-- view rewrite via self-verifying DO-block. gegnerisches_vehicle_id is 0-data, 0-code
-- (redundant to claim_parties(verursacher).vehicle_id which v_claim_base joins via party gp).
-- v_claim_base reads it once as inner-subquery source (c.gegnerisches_vehicle_id) then
-- projects sub.gegnerisches_vehicle_id; v_claim_sv reads it once flat. We NULL the inner
-- c.-read (releasing the pg_depend on claims) while the output column stays (NULL::uuid),
-- so shape + all downstream (v_claim_full inherits) are byte-identical. DROP COLUMN follows.
-- DO-block avoids 34KB hand-transcription of v_claim_base; RAISE asserts the target exists
-- (fail-fast, reproducible). Applied to prod via apply_migration (Regel 2), version 20260710172215.
DO $$
DECLARE v_old text; v_new text;
BEGIN
  -- v_claim_base (34KB nested, reloptions=<null> -> no WITH clause)
  v_old := pg_get_viewdef('public.v_claim_base'::regclass, true);
  v_new := replace(v_old, 'c.gegnerisches_vehicle_id', 'NULL::uuid AS gegnerisches_vehicle_id');
  IF v_new = v_old THEN
    RAISE EXCEPTION 'v_claim_base: inner c.gegnerisches_vehicle_id not found -- aborting';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_base AS ' || v_new;

  -- v_claim_sv (flat, preserve security_invoker=false)
  v_old := pg_get_viewdef('public.v_claim_sv'::regclass, true);
  v_new := replace(v_old, 'c.gegnerisches_vehicle_id', 'NULL::uuid AS gegnerisches_vehicle_id');
  IF v_new = v_old THEN
    RAISE EXCEPTION 'v_claim_sv: c.gegnerisches_vehicle_id not found -- aborting';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_sv WITH (security_invoker=false) AS ' || v_new;
END $$;
