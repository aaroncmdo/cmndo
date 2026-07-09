-- Vertrieb-CRM P1: Lead-Quelle vereinheitlichen (sv_leads waren zu 62/62 in partner_leads
-- dupliziert -> sv-lead-Branch RAUS; Leads kommen nur noch aus partner_leads) + rolle-Spalte
-- (sv/makler/werkstatt) fuer das Typ×Rolle-Modell. sv_leads bleibt nur fuer getDeadPins/Karte.
-- konvertiert-Exclusion faengt Konvertierung UND Selbstregistrierung ab (partner_leads-Spiegel
-- setzt konvertiert_zu_user_id) -> firmenname-Workaround entfaellt. security_invoker + Grants stabil.
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
         null::text as roh_warteliste, s.notizen as notizen, 'sv'::text as rolle
    from public.sachverstaendige s
    left join public.profiles p on p.id = s.profile_id
   where s.geloescht_am is null
  union all
  select l.id, 'partner-lead'::text,
         coalesce(l.firma, concat_ws(' ', l.ansprechpartner_vorname, l.ansprechpartner_nachname)),
         l.email, l.telefon, l.plz, l.ort, l.lat, l.lng,
         l.zugewiesen_an, l.source_channel, l.erstellt_am,
         l.status, null::boolean, false, null::boolean, null::boolean, null::boolean, null::text, l.notiz,
         (case when l.rolle = 'sachverstaendiger' then 'sv' else l.rolle end)
    from public.partner_leads l
   where l.konvertiert_zu_partner_id is null and l.konvertiert_zu_user_id is null
  union all
  select m.id, 'makler'::text,
         coalesce(m.firma, concat_ws(' ', m.ansprechpartner_vorname, m.ansprechpartner_nachname)),
         m.email, m.telefon, m.adresse_plz, m.adresse_ort, null::double precision, null::double precision,
         m.aktiviert_von, null::text, m.erstellt_am,
         m.status, null::boolean, (m.gesperrt_am is not null), null::boolean, null::boolean,
         (m.onboarding_abgeschlossen is not true), null::text, m.notizen, 'makler'::text
    from public.makler m
  union all
  select w.id, 'werkstatt'::text,
         coalesce(w.name, w.ansprechpartner_name),
         w.email, w.telefon, w.adresse_plz, w.adresse_ort, w.lat, w.lng,
         w.aktiviert_von, null::text, w.created_at,
         w.status, null::boolean, (w.gesperrt_am is not null), null::boolean, null::boolean, false, null::text, w.notizen, 'werkstatt'::text
    from public.werkstaetten w;

revoke all on public.v_vertrieb_kontakt from anon, authenticated;
grant select on public.v_vertrieb_kontakt to service_role;
