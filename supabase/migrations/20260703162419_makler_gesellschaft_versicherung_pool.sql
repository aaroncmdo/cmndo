-- Makler-Gesellschaft: ein Makler ist entweder versicherungsgebunden (-> versicherungen)
-- oder frei (-> maklerpools). Neue Lookup-Tabelle maklerpools + 2 nullable FKs am makler.
-- Der Typ (gebunden/frei) wird aus dem gesetzten FK abgeleitet (kein redundantes Feld).
create table if not exists public.maklerpools (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now()
);

alter table public.maklerpools enable row level security;
create policy "Maklerpools lesbar fuer alle authentifizierten" on public.maklerpools
  for select to authenticated using (true);
create policy "Maklerpools schreibbar nur fuer admin" on public.maklerpools
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.rolle = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.rolle = 'admin'));

insert into public.maklerpools (name) values
  ('Fonds Finanz'),
  ('Jung, DMS & Cie. (JDC)'),
  ('Netfonds'),
  ('Vema'),
  ('1:1 Assekuranzservice'),
  ('BCA'),
  ('Blau Direkt'),
  ('Fondsnet'),
  ('Fondskonzept'),
  ('Verticus'),
  ('Swiss Life Select')
on conflict (name) do nothing;

alter table public.makler add column if not exists versicherung_id uuid references public.versicherungen(id) on delete set null;
alter table public.makler add column if not exists maklerpool_id uuid references public.maklerpools(id) on delete set null;
