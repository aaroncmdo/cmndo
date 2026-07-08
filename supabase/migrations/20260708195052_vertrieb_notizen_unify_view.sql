-- Vertrieb-CRM P2.1: einheitliches notizen-Feld ueber die 5 Silos + im v_vertrieb_kontakt.
-- sachverstaendige.notizen + partner_leads.notiz existieren bereits; die drei uebrigen
-- Tabellen bekommen eine additive notizen-Spalte (IF NOT EXISTS = idempotent + kollisionssicher).
alter table public.sv_leads add column if not exists notizen text;
alter table public.makler add column if not exists notizen text;
alter table public.werkstaetten add column if not exists notizen text;

-- View um eine einheitliche notizen-Spalte (Position 20) erweitern. security_invoker + Grants
-- unveraendert. partner_leads.notiz wird auf die Sammel-Spalte notizen gemappt (UNION-Position).
create or replace view public.v_vertrieb_kontakt
with (security_invoker = true) as
  select s.id, 'sv'::text as kind,
         coalesce(s.firmenname, concat_ws(' ', p.vorname, p.nachname)) as name,
         p.email, p.telefon, s.standort_plz as plz, null::text as ort,
         s.standort_lat::double precision as lat, s.standort_lng::double precision as lng,
         null::uuid as owner_id, s.onboarding_quelle as quelle, s.created_at as erstellt_am,
         null::text as roh_status, s.ist_aktiv as roh_ist_aktiv,
         (s.gesperrt_seit is not null) as roh_gesperrt, s.verifiziert as roh_verifiziert,
         s.portal_zugang_freigeschaltet as roh_portal_zugang,
         (s.vertrag_unterschrieben is not true or s.verifizierung_status is distinct from 'geprueft') as roh_onboarding_offen,
         null::text as roh_warteliste, s.notizen as notizen
    from public.sachverstaendige s
    left join public.profiles p on p.id = s.profile_id
   where s.geloescht_am is null
  union all
  select l.id, 'partner-lead'::text,
         coalesce(l.firma, concat_ws(' ', l.ansprechpartner_vorname, l.ansprechpartner_nachname)),
         l.email, l.telefon, l.plz, l.ort, l.lat, l.lng,
         l.zugewiesen_an, l.source_channel, l.erstellt_am,
         l.status, null::boolean, false, null::boolean, null::boolean, null::boolean, null::text, l.notiz
    from public.partner_leads l
  union all
  select sl.id, 'sv-lead'::text,
         coalesce(sl.firma, sl.name, concat_ws(' ', sl.vorname, sl.nachname)),
         sl.email, sl.telefon, sl.plz, sl.ort, sl.lat, sl.lng,
         null::uuid, sl.quelle, sl.erstellt_am,
         null::text, sl.ist_aktiv, false, null::boolean, null::boolean, null::boolean,
         coalesce(sl.warteliste_status, sl.claim_status), sl.notizen
    from public.sv_leads sl
  union all
  select m.id, 'makler'::text,
         coalesce(m.firma, concat_ws(' ', m.ansprechpartner_vorname, m.ansprechpartner_nachname)),
         m.email, m.telefon, m.adresse_plz, m.adresse_ort, null::double precision, null::double precision,
         m.aktiviert_von, null::text, m.erstellt_am,
         m.status, null::boolean, (m.gesperrt_am is not null), null::boolean, null::boolean,
         (m.onboarding_abgeschlossen is not true), null::text, m.notizen
    from public.makler m
  union all
  select w.id, 'werkstatt'::text,
         coalesce(w.name, w.ansprechpartner_name),
         w.email, w.telefon, w.adresse_plz, w.adresse_ort, w.lat, w.lng,
         w.aktiviert_von, null::text, w.created_at,
         w.status, null::boolean, (w.gesperrt_am is not null), null::boolean, null::boolean, false, null::text, w.notizen
    from public.werkstaetten w;

revoke all on public.v_vertrieb_kontakt from anon, authenticated;
grant select on public.v_vertrieb_kontakt to service_role;
