-- Sub-Projekt 2 (Kunde-Portal 1+): Firmen-Konto + Flotte.
-- personen.firma_id = Konto<->Firma-SSoT; auth_user_firma_id() = Definer-Resolver
-- (RLS + Server-Actions); flotten_fahrzeuge = N:M Firma<->Fahrzeug (vertraegt die
-- globale Fahrzeug-Dedup, kein Ueberschreiben). Rein additiv, kein Definer-View-Touch.

-- 1. Konto<->Firma-Link (additiv, nullable)
alter table public.personen
  add column if not exists firma_id uuid references public.firmen(id) on delete set null;
create index if not exists idx_personen_firma_id on public.personen(firma_id) where firma_id is not null;

-- 2. Definer-Resolver: Firma des eingeloggten Kunden. STABLE + SECURITY DEFINER
--    (liest personen trotz deny-all-RLS), search_path gepinnt gg Hijack.
create or replace function public.auth_user_firma_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.firma_id
  from public.personen p
  where p.user_id = auth.uid() and p.firma_id is not null
  limit 1;
$$;
revoke all on function public.auth_user_firma_id() from anon;

-- 3. N:M Flotte (Firma <-> Fahrzeug)
create table if not exists public.flotten_fahrzeuge (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmen(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  added_by_user_id uuid references auth.users(id) on delete set null,
  notiz text,
  created_at timestamptz not null default now(),
  unique (firma_id, vehicle_id)
);
create index if not exists idx_flotten_firma on public.flotten_fahrzeuge(firma_id);
create index if not exists idx_flotten_vehicle on public.flotten_fahrzeuge(vehicle_id);

alter table public.flotten_fahrzeuge enable row level security;

-- RLS: Kunde sieht/verwaltet die Flotte SEINER Firma; Staff alles.
create policy flotten_kunde_select on public.flotten_fahrzeuge
  for select to authenticated
  using (firma_id = public.auth_user_firma_id());
create policy flotten_kunde_insert on public.flotten_fahrzeuge
  for insert to authenticated
  with check (firma_id = public.auth_user_firma_id());
create policy flotten_kunde_delete on public.flotten_fahrzeuge
  for delete to authenticated
  using (firma_id = public.auth_user_firma_id());
create policy flotten_staff_all on public.flotten_fahrzeuge
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rolle in ('admin','dispatch','kundenbetreuer')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rolle in ('admin','dispatch','kundenbetreuer')));

revoke all on public.flotten_fahrzeuge from anon;
grant select, insert, delete on public.flotten_fahrzeuge to authenticated;

-- 4. Kunde darf die Fahrzeug-Zeilen SEINER Flotte lesen (additive PERMISSIVE Policy,
--    OR-verknuepft mit den 2 Bestandspolicies -> bricht keinen Bestandszugriff).
create policy vehicles_firma_select on public.vehicles
  for select to authenticated
  using (
    exists (
      select 1 from public.flotten_fahrzeuge ff
      where ff.vehicle_id = vehicles.id and ff.firma_id = public.auth_user_firma_id()
    )
  );
