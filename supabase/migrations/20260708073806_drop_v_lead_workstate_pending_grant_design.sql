-- Revert: v_lead_workstate (20260708073516) was security_invoker, but authenticated lacks
-- SELECT on flow_links (+ likely gutachter_termine) -> "permission denied", so the caller
-- cannot read the view. A DEFINER view would read them but gets flagged by
-- audit_ungated_definer_views (no recognized gate for a lead-view). The correct fix needs a
-- coordinated design (gated flowlink/termin access OR a reviewed grant on the shared tables).
-- Dropping the non-functional view to keep prod clean; the foundation is deferred to a
-- coordinated build (see docs/superpowers/plans/2026-07-08-ops-cockpit-phase3-dispatch.md).
drop view if exists public.v_lead_workstate;
