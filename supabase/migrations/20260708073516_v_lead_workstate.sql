-- Phase 3 (Dispatch) foundation: lead-side work-state view. security_invoker=true respects
-- the leads table-RLS (leads_staff_all -> dispatch/admin see all; others scoped) — no DEFINER
-- gate fn needed. Projects l.* + active SV-termin status + latest flowlink timestamps: exactly
-- the 3 inputs deriveLeadWorkflowState(lead, aktiverTermin, flowlink) consumes.
-- NOTE: leads.status / qualifizierungs_phase are enums -> cast ::text before comparing to
-- string literals (raw coalesce(enum,'') tries to coerce '' into the enum and fails).
--
-- SUPERSEDED IMMEDIATELY by 20260708073806 (drop): under security_invoker the caller
-- (authenticated) lacks SELECT on flow_links (+ likely gutachter_termine) -> "permission
-- denied", so the view is unreadable. The correct fix needs a coordinated design (gated
-- flowlink/termin access OR a reviewed shared-table grant) — see the Phase 3 plan. Both
-- files kept for an accurate, replayable migration chain.
create view public.v_lead_workstate with (security_invoker = true) as
select
  l.*,
  t.status           as termin_status,
  f.gesendet_am      as fl_gesendet_am,
  f.geoeffnet_am     as fl_geoeffnet_am,
  f.abgeschlossen_am as fl_abgeschlossen_am,
  f.fall_id          as fl_fall_id
from public.leads l
left join lateral (
  select gt.status from public.gutachter_termine gt
  where gt.lead_id = l.id and gt.status in ('reserviert','bestaetigt')
  order by gt.start_zeit desc nulls last limit 1
) t on true
left join lateral (
  select fl.gesendet_am, fl.geoeffnet_am, fl.abgeschlossen_am, fl.fall_id
  from public.flow_links fl where fl.lead_id = l.id
  order by fl.erstellt_am desc nulls last limit 1
) f on true
where coalesce(l.disqualifiziert, false) = false
  and coalesce(l.status::text, '') not in ('umgewandelt','umgewandelt-sv','disqualifiziert','kalt')
  and coalesce(l.qualifizierungs_phase::text, '') not in ('konvertiert','abgeschlossen','kalt','disqualifiziert');

revoke all on public.v_lead_workstate from anon;
grant select on public.v_lead_workstate to authenticated;
