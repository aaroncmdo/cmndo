-- Slice 3 (claims Normalisierung / CMM-49) -- T3 column drop.
-- Follows 20260710172215_v_claim_base_sv_null_gegnerisches_vehicle_id_shape_preserving, which
-- released v_claim_base + v_claim_sv from depending on this column. gegnerisches_vehicle_id
-- is a dead flat FK (0 data, 0 code) -- the live opponent-vehicle link is
-- claim_parties(verursacher).vehicle_id, which v_claim_base joins via the party (gp).
-- FK claims_gegnerisches_vehicle_id_fkey is single-column -> auto-drops with the column.
-- Applied to prod via apply_migration (Regel 2), version 20260710172528.
ALTER TABLE public.claims
  DROP COLUMN gegnerisches_vehicle_id;
