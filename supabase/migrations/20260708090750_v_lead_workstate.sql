-- Ops-Cockpit Phase 3 (Dispatch): abgeleitete Lead-Work-State-View.
-- security_invoker=true -> KEIN DEFINER-Bypass (audit_ungated_definer_views bleibt 0).
-- Projiziert leads.* + aktiven SV-Termin-Status (Q5) + juengste FlowLink-Timestamps
-- = exakt die 3 Inputs von deriveLeadWorkflowState(lead, aktiverTermin, flowlink).
-- Zugriff: service_role ONLY (revoke anon+authenticated). flow_links/gutachter_termine
-- sind default-deny fuer authenticated (nur ueber kontrollierte Pfade) -> die Cockpit-
-- Loader liest via createAdminClient() NACH requirePortalAccess (Route-Gate + Role-Guard),
-- genau wie dispatch/leads/[id]/page.tsx:112. adminClient OHNE Guard waere IDOR.
-- Hinweis: leads.status ist enum lead_status -> ::text-Cast fuer die Terminal-Filter.
create or replace view public.v_lead_workstate with (security_invoker = true) as
select
  l.*,
  t.status          as termin_status,
  f.gesendet_am     as fl_gesendet_am,
  f.geoeffnet_am    as fl_geoeffnet_am,
  f.abgeschlossen_am as fl_abgeschlossen_am,
  f.fall_id         as fl_fall_id
from public.leads l
left join lateral (
  select gt.status
  from public.gutachter_termine gt
  where gt.lead_id = l.id and gt.status in ('reserviert','bestaetigt')
  order by gt.start_zeit desc nulls last
  limit 1
) t on true
left join lateral (
  select fl.gesendet_am, fl.geoeffnet_am, fl.abgeschlossen_am, fl.fall_id
  from public.flow_links fl
  where fl.lead_id = l.id
  order by fl.erstellt_am desc nulls last
  limit 1
) f on true
where coalesce(l.disqualifiziert, false) = false
  and coalesce(l.status::text, '') not in ('umgewandelt','umgewandelt-sv','disqualifiziert','kalt')
  and coalesce(l.qualifizierungs_phase::text, '') not in ('konvertiert','abgeschlossen','kalt','disqualifiziert');

revoke all on public.v_lead_workstate from anon, authenticated;
grant select on public.v_lead_workstate to service_role;
