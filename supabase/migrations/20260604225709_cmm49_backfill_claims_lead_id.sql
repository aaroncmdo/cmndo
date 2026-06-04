-- CMM-49: claims.lead_id als vollstaendige SSoT herstellen.
-- 2 Seed-Rows (CLM-2026-00101/00102) hatten claims.lead_id=NULL obwohl faelle.lead_id gesetzt.
-- Reiner Null-Fill aus faelle (dem Wert, den der Code heute liest) -> value-preserving;
-- macht faelle-freie lead_id-Reads (CMM-49) value-preserving statt 2-Row-lueckig.
UPDATE public.claims c
SET lead_id = f.lead_id
FROM public.faelle f
WHERE f.claim_id = c.id
  AND c.lead_id IS NULL
  AND f.lead_id IS NOT NULL;
