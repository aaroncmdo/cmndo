-- CMM-49 P0: faelle.created_at konservieren, bevor faelle gedroppt wird. faelle.created_at hat einen
-- EIGENEN Zeitstempel (!= claims.created_at, 75-Zeilen-Skew) -> v_claim_full.fall_created_at wuerde
-- sonst beim faelle-Drop seine Semantik verlieren. Home = faelle_claim_bridge (entkoppelt Route-Key
-- schon von faelle). Additiv + Backfill.
ALTER TABLE public.faelle_claim_bridge ADD COLUMN fall_created_at timestamptz;

UPDATE public.faelle_claim_bridge b
  SET fall_created_at = f.created_at
  FROM public.faelle f
  WHERE f.id = b.fall_id;

COMMENT ON COLUMN public.faelle_claim_bridge.fall_created_at IS
  'CMM-49: faelle.created_at konserviert (eigener Zeitstempel != claims.created_at) damit v_claim_full.fall_created_at den faelle-Drop ueberlebt.';
