-- v_ops_rollup must not be an ungated DEFINER view. Making it security_invoker=true
-- means it runs with the caller's permissions: the underlying gated v_claim_workstate
-- (which carries claim_sichtbar_fuer_aktuellen_user) then filters per-user (admin=all,
-- KB=own). Also revoke anon: ops rollups are never for anonymous callers.
CREATE OR REPLACE VIEW public.v_ops_rollup
WITH (security_invoker = true) AS
SELECT
  main_phase,
  kundenbetreuer_id,
  count(*)::int AS anzahl,
  count(*) FILTER (WHERE updated_at < now() - interval '7 days')::int AS stale_anzahl
FROM public.v_claim_workstate
WHERE ist_aktiv IS TRUE
GROUP BY main_phase, kundenbetreuer_id;

REVOKE ALL ON public.v_ops_rollup FROM anon;
GRANT SELECT ON public.v_ops_rollup TO authenticated;
