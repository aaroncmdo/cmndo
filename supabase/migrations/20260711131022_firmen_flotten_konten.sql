-- firmen_flotten_konten: Link flottenmanager-User <-> firma (admin-provisioniert).
-- Analog makler.user_id, aber eigene Link-Tabelle (firma existiert unabhaengig).
-- Getrackte Version 20260711131022 (via plugin apply_migration).
create table if not exists public.firmen_flotten_konten (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmen(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'aktiv' check (status in ('aktiv','pausiert','deaktiviert')),
  aktiviert_am timestamptz not null default now(),
  aktiviert_von uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id)
);
create index if not exists idx_ffk_firma on public.firmen_flotten_konten(firma_id);

alter table public.firmen_flotten_konten enable row level security;

-- Definer-Resolver: firma des eingeloggten flottenmanagers (fuer RLS-Policies).
create or replace function public.auth_flottenmanager_firma_id()
returns uuid language sql stable security definer set search_path = public as $$
  select k.firma_id from public.firmen_flotten_konten k
  where k.user_id = auth.uid() and k.status = 'aktiv' limit 1;
$$;
revoke all on function public.auth_flottenmanager_firma_id() from anon;

-- RLS firmen_flotten_konten: eigenes Konto lesen; Staff alles. INSERT/UPDATE nur Admin-Client.
create policy ffk_self_select on public.firmen_flotten_konten
  for select to authenticated using (user_id = (select auth.uid()));
create policy ffk_staff_all on public.firmen_flotten_konten
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rolle in ('admin','dispatch','kundenbetreuer')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rolle in ('admin','dispatch','kundenbetreuer')));
revoke all on public.firmen_flotten_konten from anon;
grant select on public.firmen_flotten_konten to authenticated;

-- Additive flotten_fahrzeuge-Policies fuer flottenmanager (OR mit den kunde-Policies).
create policy flotten_fm_select on public.flotten_fahrzeuge
  for select to authenticated using (firma_id = public.auth_flottenmanager_firma_id());
create policy flotten_fm_insert on public.flotten_fahrzeuge
  for insert to authenticated with check (firma_id = public.auth_flottenmanager_firma_id());
create policy flotten_fm_delete on public.flotten_fahrzeuge
  for delete to authenticated using (firma_id = public.auth_flottenmanager_firma_id());

-- Additive vehicles-select fuer die Flotten-Fahrzeuge des flottenmanagers.
create policy vehicles_fm_flotte_select on public.vehicles
  for select to authenticated
  using (exists (select 1 from public.flotten_fahrzeuge ff
    where ff.vehicle_id = vehicles.id and ff.firma_id = public.auth_flottenmanager_firma_id()));
