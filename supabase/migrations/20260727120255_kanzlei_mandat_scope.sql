-- Kanzlei-Cross-Tenant-Scope: von service_typ='komplett' auf echtes Mandat (kanzlei_faelle).
-- RLS-Runtime-Befund 27.07. (audit-rls-anon-start-3schichten): test-kanzlei sah 15/20 claims +
-- 15/39 leads bei nur 2 Mandaten. Wurzel: 6 SELECT-Policies + der Helper
-- claim_sichtbar_fuer_aktuellen_user scopen den kanzlei-Zweig auf service_typ='komplett'
-- (= Kunde hat Voll-Paket, 21/22 Claims) statt auf kanzlei_faelle (= diese Kanzlei ist mandatiert,
-- 3 Zeilen). Heute latent (nur 1 Kanzlei), aktiver Cross-Tenant-Breach beim 2.-Kanzlei-Onboarding.
-- Fix keyt auf kanzlei_faelle -> die Ueber-Zuweisung von claims.kanzlei_id (21x dieselbe) wird
-- fuer RLS irrelevant (kein Daten-Backfill noetig). Nur der kanzlei-Zweig aendert sich; alle
-- anderen Rollen-Zweige bleiben byte-fuer-byte erhalten.

-- 1. Kanonischer Mandat-Helper (SECURITY DEFINER, self-contained: prueft rolle=kanzlei + Mandat).
--    Ein SSoT statt inline-Praedikat -> verhindert erneute Drift zwischen den Policies.
create or replace function public.is_kanzlei_mandat(p_claim_id uuid)
returns boolean
language sql stable security definer
set search_path to 'pg_catalog','public'
as $$
  select exists (
    select 1
    from public.kanzlei_faelle kf
    join public.profiles p on p.id = (select auth.uid())
    where p.rolle = 'kanzlei'
      and p.kanzlei_id = kf.kanzlei_id
      and (kf.claim_id = p_claim_id or kf.fall_id = p_claim_id)
  );
$$;

-- 2. claim_sichtbar_fuer_aktuellen_user: kanzlei-Zweig von (rolle=kanzlei AND service_typ=komplett)
--    auf is_kanzlei_mandat(c.id). Alle anderen Zweige unveraendert. Fixt zugleich fall_dokumente
--    (beide Policies delegieren an diesen Helper) + den ersten Zweig von faelle_claim_bridge_select.
create or replace function public.claim_sichtbar_fuer_aktuellen_user(p_claim_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select
    auth.role() = 'service_role'
    or exists (select 1 from profiles where id = (select auth.uid()) and rolle in ('admin','dispatch'))
    or exists (
      select 1 from claims c where c.id = p_claim_id and (
            c.geschaedigter_user_id = (select auth.uid())
         or is_claim_user_party(c.id)
         or c.sv_id        in (select id from sachverstaendige where profile_id = (select auth.uid()))
         or c.makler_id    in (select id from makler        where user_id    = (select auth.uid()))
         or c.werkstatt_id in (select id from werkstaetten  where user_id    = (select auth.uid()))
         or (exists(select 1 from profiles where id=(select auth.uid()) and rolle='kundenbetreuer')
             and (c.kundenbetreuer_id = (select auth.uid()) or c.kundenbetreuer_id is null))
         or is_kanzlei_mandat(c.id)
      ))
    or exists (
      select 1 from makler_fall_consent mfc join makler m on m.id = mfc.makler_id
      where m.user_id = (select auth.uid()) and mfc.widerrufen_am is null
        and (mfc.claim_id = p_claim_id or (mfc.claim_id is null and mfc.fall_id = p_claim_id))
    );
$$;

-- 3. claims: kanzlei-Zweig (is_kanzlei() AND service_typ=komplett AND is_kanzlei_member(kanzlei_id))
--    -> is_kanzlei_mandat(id). Alle anderen Zweige verbatim.
alter policy claims__b1sel_au on public.claims using (
  (select is_admin())
  or ((select is_kundenbetreuer()) and ((kundenbetreuer_id = (select auth.uid())) or (kundenbetreuer_id is null)))
  or (((select is_dispatcher()) and dispatcher_owns_lead(lead_id)) or (geschaedigter_user_id = (select auth.uid())) or is_claim_user_party(id))
  or (sv_id in (select s.id from sachverstaendige s where s.profile_id = (select auth.uid())))
  or is_kanzlei_mandat(id)
);

-- 4. faelle_claim_bridge_select: inline kanzlei-Zweig (service_typ=komplett AND rolle=kanzlei)
--    -> is_kanzlei_mandat(c.id). Erster Zweig (claim_sichtbar) schon via #2 gefixt.
alter policy faelle_claim_bridge_select on public.faelle_claim_bridge using (
  claim_sichtbar_fuer_aktuellen_user(claim_id)
  or (
    (select is_admin())
    or (exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.rolle = 'dispatch'::user_role))
    or ((exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.rolle = 'kundenbetreuer'::user_role))
        and (exists (select 1 from claims c where c.id = faelle_claim_bridge.claim_id and c.kundenbetreuer_id = (select auth.uid()))))
    or (exists (select 1 from claims c where c.id = faelle_claim_bridge.claim_id
        and (c.geschaedigter_user_id = (select auth.uid())
             or c.sv_id in (select sachverstaendige.id from sachverstaendige where sachverstaendige.profile_id = (select auth.uid()))
             or is_kanzlei_mandat(c.id))))
  )
  or (exists (select 1 from makler_fall_consent mfc join makler m on m.id = mfc.makler_id
      where mfc.fall_id = faelle_claim_bridge.fall_id and m.user_id = (select auth.uid()) and mfc.widerrufen_am is null))
);

-- 5. leads (authenticated): kanzlei-Zweig (rolle=kanzlei AND service_typ=komplett) -> is_kanzlei_mandat(c.id).
alter policy leads__b1sel_au on public.leads using (
  (select is_admin())
  or (exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.rolle = any (array['admin'::user_role, 'dispatch'::user_role])))
  or (exists (select 1 from claims c join profiles p on p.id = (select auth.uid()) where c.lead_id = leads.id and p.rolle = 'kundenbetreuer'::user_role and c.kundenbetreuer_id = (select auth.uid())))
  or ((exists (select 1 from claims c where c.lead_id = leads.id and is_kanzlei_mandat(c.id)))
      or (exists (select 1 from claims c join profiles p on p.id = (select auth.uid()) where c.lead_id = leads.id and p.rolle = 'kundenbetreuer'::user_role and c.kundenbetreuer_id = (select auth.uid()))))
  or ((exists (select 1 from promotion_codes pc join makler m on m.id = pc.makler_id where pc.id = leads.promotion_code_id and m.user_id = (select auth.uid())))
      or (exists (select 1 from claims c join sachverstaendige sv on sv.id = c.sv_id join profiles p on p.id = (select auth.uid()) where c.lead_id = leads.id and p.id = (select auth.uid()) and p.rolle = 'sachverstaendiger'::user_role)))
);

-- 6. leads (anon-role variant): gleicher kanzlei-Zweig-Swap.
alter policy leads__b1sel_an on public.leads using (
  (exists (select 1 from claims c where c.lead_id = leads.id and is_kanzlei_mandat(c.id)))
  or (exists (select 1 from claims c join profiles p on p.id = (select auth.uid()) where c.lead_id = leads.id and p.rolle = 'kundenbetreuer'::user_role and c.kundenbetreuer_id = (select auth.uid())))
  or (status = 'flow-gesendet'::lead_status)
);

-- 7. timeline (authenticated): kanzlei-Zweig -> is_kanzlei_mandat(c.id).
alter policy timeline__b1sel_au on public.timeline using (
  (select is_admin())
  or ((fall_id in (select b.fall_id from faelle_claim_bridge b join claims c on c.id = b.claim_id join sachverstaendige s on s.id = c.sv_id where s.profile_id = (select auth.uid())))
      or (fall_id in (select b.fall_id from faelle_claim_bridge b join claims c on c.id = b.claim_id where c.geschaedigter_user_id = (select auth.uid()))))
  or (exists (select 1 from faelle_claim_bridge b join claims c on c.id = b.claim_id where b.fall_id = timeline.fall_id and is_kanzlei_mandat(c.id)))
  or can_access_claim(claim_id)
);

-- 8. timeline (anon-role variant): gleicher Swap.
alter policy timeline__b1sel_an on public.timeline using (
  exists (select 1 from faelle_claim_bridge b join claims c on c.id = b.claim_id where b.fall_id = timeline.fall_id and is_kanzlei_mandat(c.id))
);
