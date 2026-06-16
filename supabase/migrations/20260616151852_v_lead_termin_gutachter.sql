-- AAR-956: Single-Source-View fuer Termin + Gutachter pro Lead (Dispatch).
-- Aaron: "wir muessen sehen ob der Kunde schon einen Termin hat oder nicht und
-- auch ob er einen Gutachter hat oder nicht" — aus EINER Quelle, reconciled ueber
-- alle Pfade: Termin dispatch-nativ (lead_id) ODER self-service-nativ
-- (bezug_typ='lead'/bezug_id); Gutachter autoritativ aus dem gebuchten Termin
-- (assignee_id/sv_lead_id), sonst aus dem Kundenwunsch der Gutachter-Finder-Anfrage.
-- security_invoker=true → kein RLS-Bypass (leak-safe); Dispatch liest via
-- Admin-Client (service_role), Pattern wie flow_links im Lead-Detail.
create or replace view public.v_lead_termin_gutachter
with (security_invoker = true) as
with termin_pick as (
  -- Pro Lead der juengste aktive Termin (storniert/abgelehnt raus).
  select distinct on (lead_key)
    lead_key,
    t.id         as termin_id,
    t.start_zeit as termin_start,
    t.status     as termin_status,
    t.assignee_id,
    t.assignee_typ,
    t.sv_lead_id
  from public.gutachter_termine t
  cross join lateral (
    select coalesce(t.lead_id, case when t.bezug_typ = 'lead' then t.bezug_id end) as lead_key
  ) k
  where k.lead_key is not null
    and t.status not in ('storniert', 'abgelehnt')
  order by lead_key, t.created_at desc
),
kunden_pick as (
  -- Pro konvertiertem Lead der juengste Gutachter-Finder-Pick (Kundenwunsch).
  select distinct on (g.konvertiert_zu_lead_id)
    g.konvertiert_zu_lead_id  as lead_id,
    g.zugeordneter_sv_id      as pick_sv_id,
    g.zugeordneter_sv_lead_id as pick_sv_lead_id
  from public.gutachter_finder_anfragen g
  where g.konvertiert_zu_lead_id is not null
  order by g.konvertiert_zu_lead_id, g.erstellt_am desc
),
base as (
  select
    l.id as lead_id,
    tp.termin_id, tp.termin_start, tp.termin_status,
    tp.assignee_id, tp.assignee_typ, tp.sv_lead_id,
    kp.pick_sv_id, kp.pick_sv_lead_id
  from public.leads l
  left join termin_pick tp on tp.lead_key = l.id
  left join kunden_pick kp on kp.lead_id  = l.id
  where tp.termin_id is not null or kp.lead_id is not null
)
select
  b.lead_id,
  b.termin_id,
  (b.termin_id is not null) as hat_termin,
  b.termin_start,
  b.termin_status,
  case
    when b.assignee_typ = 'sachverstaendiger' and b.assignee_id is not null then 'sv'
    when b.sv_lead_id is not null                                           then 'sv_lead'
    when b.pick_sv_id is not null                                           then 'sv'
    when b.pick_sv_lead_id is not null                                      then 'sv_lead'
  end as gutachter_typ,
  case
    when b.termin_id is not null and (b.assignee_id is not null or b.sv_lead_id is not null) then 'gebucht'
    when b.pick_sv_id is not null or b.pick_sv_lead_id is not null                           then 'kunden_pick'
  end as gutachter_quelle,
  coalesce(
    case when b.assignee_typ = 'sachverstaendiger' then b.assignee_id end,
    b.sv_lead_id, b.pick_sv_id, b.pick_sv_lead_id
  ) as gutachter_id,
  (coalesce(
    case when b.assignee_typ = 'sachverstaendiger' then b.assignee_id end,
    b.sv_lead_id, b.pick_sv_id, b.pick_sv_lead_id
  ) is not null) as hat_gutachter,
  coalesce(
    nullif(trim(coalesce(bp.vorname,'') || ' ' || coalesce(bp.nachname,'')), ''),
    nullif(trim(coalesce(bsl.vorname,'') || ' ' || coalesce(bsl.nachname,'')), ''), bsl.name, bsl.firma,
    nullif(trim(coalesce(pp.vorname,'') || ' ' || coalesce(pp.nachname,'')), ''),
    nullif(trim(coalesce(psl.vorname,'') || ' ' || coalesce(psl.nachname,'')), ''), psl.name, psl.firma
  ) as gutachter_name,
  coalesce(
    nullif(trim(coalesce(pp.vorname,'') || ' ' || coalesce(pp.nachname,'')), ''),
    nullif(trim(coalesce(psl.vorname,'') || ' ' || coalesce(psl.nachname,'')), ''), psl.name, psl.firma
  ) as kunden_pick_name,
  (b.assignee_typ = 'sachverstaendiger'
     and b.assignee_id is not null
     and b.pick_sv_id is not null
     and b.assignee_id <> b.pick_sv_id) as gutachter_divergiert
from base b
left join public.sachverstaendige bsv on bsv.id = (case when b.assignee_typ = 'sachverstaendiger' then b.assignee_id end)
left join public.profiles bp on bp.id = bsv.profile_id
left join public.sv_leads bsl on bsl.id = b.sv_lead_id
left join public.sachverstaendige psv on psv.id = b.pick_sv_id
left join public.profiles pp on pp.id = psv.profile_id
left join public.sv_leads psl on psl.id = b.pick_sv_lead_id;

revoke all on public.v_lead_termin_gutachter from anon;
grant select on public.v_lead_termin_gutachter to authenticated, service_role;
