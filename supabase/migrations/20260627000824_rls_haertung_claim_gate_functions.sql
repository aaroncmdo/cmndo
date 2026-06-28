-- RLS-Haertung (Spec 2026-06-27): Row-Gate + Column-Nuller fuer die Claim-Views.
-- Additiv: nichts referenziert diese Funktionen bis Task 3 (View-Rewrite). Zero Prod-Impact.

-- Row-Gate: sieht der aktuelle Aufrufer diesen Claim?
create or replace function public.claim_sichtbar_fuer_aktuellen_user(p_claim_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
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
         or (exists(select 1 from profiles where id=(select auth.uid()) and rolle='kanzlei')
             and c.service_typ = 'komplett')
      ));
$$;

-- Column-Nuller (rollenbasiert, deny-list-robust). service_role sieht alles.
create or replace function public.rolle_sieht_bankdaten() returns boolean language sql stable security definer set search_path=public as $$
  select auth.role()='service_role'
     or not exists (select 1 from profiles where id=(select auth.uid()) and rolle in ('sachverstaendiger','makler','werkstatt'));
$$;
create or replace function public.rolle_sieht_regulierung() returns boolean language sql stable security definer set search_path=public as $$
  select auth.role()='service_role'
     or not exists (select 1 from profiles where id=(select auth.uid()) and rolle in ('sachverstaendiger','makler','werkstatt'));
$$;
create or replace function public.rolle_sieht_gutachtenwerte() returns boolean language sql stable security definer set search_path=public as $$
  select auth.role()='service_role'
     or not exists (select 1 from profiles where id=(select auth.uid()) and rolle in ('makler','werkstatt'));
$$;
create or replace function public.rolle_sieht_margen() returns boolean language sql stable security definer set search_path=public as $$
  select auth.role()='service_role'
     or exists (select 1 from profiles where id=(select auth.uid()) and rolle in ('admin','kundenbetreuer','dispatch'));
$$;

grant execute on function public.claim_sichtbar_fuer_aktuellen_user(uuid) to authenticated, anon, service_role;
grant execute on function public.rolle_sieht_bankdaten()      to authenticated, anon, service_role;
grant execute on function public.rolle_sieht_regulierung()    to authenticated, anon, service_role;
grant execute on function public.rolle_sieht_gutachtenwerte() to authenticated, anon, service_role;
grant execute on function public.rolle_sieht_margen()         to authenticated, anon, service_role;
