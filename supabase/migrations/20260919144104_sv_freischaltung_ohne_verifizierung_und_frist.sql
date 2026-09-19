-- Aaron 2026-09-19: "ich moechte nicht mehr verifizieren und ich moechte auch nicht mehr
-- nachhalten muessen, ob die Dokumente fehlen oder nicht. Das heisst, wenn Dokumente fehlen,
-- soll der Sachverstaendige trotzdem angezeigt werden und sogar auch buchbar sein. Allerdings
-- muss er die Dokumente hochladen koennen im Onboarding ... Damit soll er wirklich verifiziert
-- und buchbar sein."
--
-- Gemessen am selben Tag auf prod (31 echte Gutachter): 14 von 27 freigeschalteten ohne
-- `verifiziert` (kein Siegel, kein Whitelabel), 3 per `frist_ueberschritten` aus der Engine
-- ausgeschlossen, 19 laufende/abgelaufene 14-Tage-Fristen, 18 verwaiste Admin-Aufgaben,
-- und KEIN Gutachter konnte seine eigenen hochgeladenen Dokumente zuruecklesen (die
-- authenticated-Policy auf pflichtdokumente hatte keinen Zweig fuer sv_id = eigener SV).
--
-- Zurueckgenommen werden damit: Option B vom 08.08. (Tier-2-Frist + Dispatch-Stopp) und der
-- dokumentgebundene Siegel-Setter vom 31.08. Der Code (gleicher PR) setzt `verifiziert` ab
-- jetzt an JEDEM Freischaltungs-Eingang (src/lib/sv/freischaltung.ts), schreibt keine Frist
-- mehr und ignoriert `verifizierung_status` im Dispatch-Filter. Diese Migration zieht den
-- Bestand nach und oeffnet die Policy. Sie OEFFNET nur, sie sperrt nichts — deshalb ist es
-- ungefaehrlich, dass sie vor dem Code-Deploy wirkt.
--
-- Soll-Blatt: memory/abnahmen/2026-09-19-sv-onboarding-auto-freischaltung-ueberall.md

-- ── 1) Ein Sachverstaendiger darf seine eigenen Onboarding-Dokumente lesen ────────────────
-- Bestehende Zweige 1:1 uebernommen (admin · Fall des Geschaedigten · Fall des zugewiesenen
-- SV · can_view_claim), neu: sv_id gehoert zum eigenen Profil. Ohne diesen Zweig zeigte
-- /gutachter/verifizierung nach jedem Upload weiter "Hochladen" (RLS-Client sah 0 Zeilen).
drop policy if exists "pflichtdokumente__b1sel_au" on public.pflichtdokumente;
create policy "pflichtdokumente__b1sel_au"
  on public.pflichtdokumente
  for select
  to authenticated
  using (
    ((select profiles.rolle from profiles where profiles.id = (select auth.uid() as uid)) = 'admin'::user_role)
    or (exists (
      select 1
      from (faelle_claim_bridge b join claims c on ((c.id = b.claim_id)))
      where ((b.fall_id = pflichtdokumente.fall_id) and (c.geschaedigter_user_id = (select auth.uid() as uid)))
    ))
    or (exists (
      select 1
      from ((faelle_claim_bridge b join claims c on ((c.id = b.claim_id))) join sachverstaendige sv on ((sv.id = c.sv_id)))
      where ((b.fall_id = pflichtdokumente.fall_id) and (sv.profile_id = (select auth.uid() as uid)))
    ))
    or (fall_id in (
      select b.fall_id
      from (faelle_claim_bridge b join claims c on ((c.id = b.claim_id)))
      where (c.geschaedigter_user_id = (select auth.uid() as uid))
    ))
    or can_view_claim(claim_id)
    or (exists (
      select 1
      from sachverstaendige sv
      where sv.id = pflichtdokumente.sv_id and sv.profile_id = (select auth.uid() as uid)
    ))
  );

-- ── 2) Bestand: Siegel fuer jeden freigeschalteten, aktiven Gutachter ────────────────────
update public.sachverstaendige
set verifiziert = true,
    verifiziert_am = coalesce(verifiziert_am, now())
where portal_zugang_freigeschaltet = true
  and ist_aktiv = true
  and geloescht_am is null
  and verifiziert = false;

-- ── 3) Bestand: Frist-Sperren aufheben, Fristen loeschen ─────────────────────────────────
-- 'frist_ueberschritten' wird nirgends mehr geschrieben; 'ausstehend' heisst nur noch
-- "Nachweise nicht geprueft" (informativ) und entscheidet nichts.
update public.sachverstaendige
set verifizierung_status = 'ausstehend',
    verifizierung_frist_ueberschritten_am = null
where verifizierung_status = 'frist_ueberschritten';

update public.sachverstaendige
set verifizierung_frist_bis = null,
    verifizierung_reminder_7d_gesendet_am = null
where verifizierung_frist_bis is not null
   or verifizierung_reminder_7d_gesendet_am is not null;

-- ── 4) Bestand: gegenstandslose Admin-Aufgaben schliessen ────────────────────────────────
--  a) "Verifizierungs-Frist abgelaufen" (Cron) — es gibt keine Frist mehr.
--  b) "Dokument zu pruefen" (je Upload) — es gibt keine Pruefpflicht mehr.
--  c) "Basic-Registrierung/-Claim wartet auf Freigabe" — nur noch der Geo-Guard-Fall ist
--     eine echte Aufgabe: SV existiert, nicht geloescht, portal_zugang_freigeschaltet=false.
--     Alle anderen (SV weg oder laengst freigeschaltet) waren verwaist (12 + 1 auf prod).
update public.tasks
set status = 'erledigt',
    erledigt_am = now(),
    auto_resolved_am = now(),
    auto_resolved_grund = 'Verifizierung/Frist abgeschafft (Aaron 19.09.2026) — Aufgabe gegenstandslos'
where status in ('offen', 'in-bearbeitung')
  and (
    trigger_event = 'verifizierung_frist_ueberschritten'
    or typ = 'sv_dokument_review'
    or (
      typ = 'sv_basic_claim_review'
      and not exists (
        select 1 from public.sachverstaendige s
        where s.id::text = tasks.entity_id::text
          and s.geloescht_am is null
          and s.portal_zugang_freigeschaltet = false
      )
    )
  );
