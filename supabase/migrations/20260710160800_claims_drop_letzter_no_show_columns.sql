-- Slice 2 (claims Normalisierung / CMM-49) -- T1 column drop.
-- Follows 20260710160507_v_claim_sv_null_letzter_no_show_shape_preserving.sql, which
-- already released v_claim_sv's dependency on these two columns (NULL-substitution).
-- Both are dead denorm no-show timestamps: 0 data, 0 code writers/readers, 0 functions,
-- 0 policies, no constraints/indexes (DB-verified 2026-07-10). Live no-show tracking
-- uses claims.kunde_no_show_count / sv_no_show_count. Applied to prod via apply_migration
-- (Regel 2), tracked version 20260710160800.
ALTER TABLE public.claims
  DROP COLUMN letzter_no_show_am,
  DROP COLUMN letzter_sv_no_show_am;
