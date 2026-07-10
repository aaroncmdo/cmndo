-- Slice 3 (claims Normalisierung / CMM-49) -- T3 column drop.
-- Follows 20260710175305_v_claim_base_null_kunde_lat_lng_shape_preserving, which released
-- v_claim_base from depending on these columns. claims.kunde_lat/kunde_lng are dead denorm
-- geo columns: 0 data, 0 claims-writer, 0 reader (leads.kunde_lat is a separate live column;
-- faelle.kunde_lat is written by buildFallInsertFromLead and is untouched here).
-- Applied to prod via apply_migration (Regel 2), version 20260710175328.
ALTER TABLE public.claims
  DROP COLUMN kunde_lat,
  DROP COLUMN kunde_lng;
