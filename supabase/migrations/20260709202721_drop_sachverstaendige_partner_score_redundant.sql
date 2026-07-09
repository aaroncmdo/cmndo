-- Reverse of add_sachverstaendige_partner_score (20260709201436): the column is
-- redundant with the existing partner_rang table (score/rating_score/rang), which the
-- finder already reads via getPartnerRangBatch (flag PARTNER_RANG_MATCHING). No code
-- references partner_score. Net-zero with the add migration; both files are committed so
-- a fresh DB (add then drop) reproduces the same end state (no column).
ALTER TABLE public.sachverstaendige
  DROP COLUMN IF EXISTS partner_score;
