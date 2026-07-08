-- Phase 2: admin rollup aggregate (Phase x Owner counts + coarse stale count) for the
-- Admin cockpit matrix. Aggregates the gated v_claim_workstate -> rows are transitively
-- gated (admin sees all, KB sees own). No claim_id column + counts only (no PII).
-- NOTE: superseded immediately by 20260707233820 (security_invoker + revoke anon) so the
-- RLS audit (audit_ungated_definer_views) does not flag it; both files kept for an
-- accurate, replayable migration chain.
CREATE VIEW public.v_ops_rollup AS
SELECT
  main_phase,
  kundenbetreuer_id,
  count(*)::int AS anzahl,
  count(*) FILTER (WHERE updated_at < now() - interval '7 days')::int AS stale_anzahl
FROM public.v_claim_workstate
WHERE ist_aktiv IS TRUE
GROUP BY main_phase, kundenbetreuer_id;

GRANT SELECT ON public.v_ops_rollup TO authenticated;
