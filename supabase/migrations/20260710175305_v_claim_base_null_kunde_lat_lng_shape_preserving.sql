-- Slice 3 (claims Normalisierung / CMM-49) -- T3 kunde_lat/kunde_lng: shape-preserving
-- v_claim_base rewrite via self-verifying DO-block. Both are dead claims-denorm geo columns:
-- 0 data, 0 claims-writer (buildFallInsertFromLead writes faelle.kunde_lat, a different table;
-- convert-lead-to-claim reads lead.kunde_lat only as fallback for claims.schadenort_lat),
-- 0 reader (app reads leads.kunde_lat; v_claim_full does not even project these). Only
-- v_claim_base projects them once as inner c.-read + outer sub.-projection. NULL the inner
-- c.-reads (release pg_depend), output columns stay (NULL::numeric) -> shape byte-identical.
-- DROP COLUMN follows. RAISE asserts each target exists (fail-fast, reproducible).
-- Applied to prod via apply_migration (Regel 2), version 20260710175305.
DO $$
DECLARE v_old text; v_new text;
BEGIN
  v_old := pg_get_viewdef('public.v_claim_base'::regclass, true);
  v_new := replace(v_old, 'c.kunde_lat', 'NULL::numeric AS kunde_lat');
  IF v_new = v_old THEN RAISE EXCEPTION 'v_claim_base: inner c.kunde_lat not found -- aborting'; END IF;
  v_old := v_new;
  v_new := replace(v_old, 'c.kunde_lng', 'NULL::numeric AS kunde_lng');
  IF v_new = v_old THEN RAISE EXCEPTION 'v_claim_base: inner c.kunde_lng not found -- aborting'; END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_base AS ' || v_new;
END $$;
