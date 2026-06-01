-- W2.3 / AAR-951 PR1: Mitarbeiter-Verguetung aus profiles auslagern in admin-only Tabelle.
-- profiles.gehalt_brutto/gehaltsstufe/position/eingestellt_am waren via staff_read_all
-- (is_staff() = admin+kundenbetreuer+dispatch) fuer kundenbetreuer+dispatch lesbar
-- (Zeilen-RLS = keine Spalten-Granularitaet). Neu: 1:1-Tabelle mit RLS is_admin().
-- Spalten-DROP auf profiles folgt in PR2 (erst nachdem der repointete Code prod-live ist).
create table if not exists public.mitarbeiter_verguetung (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  gehalt_brutto numeric,
  gehaltsstufe text,
  position text,
  eingestellt_am date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mitarbeiter_verguetung enable row level security;
grant select, insert, update, delete on public.mitarbeiter_verguetung to authenticated;

drop policy if exists verguetung_admin_only on public.mitarbeiter_verguetung;
create policy verguetung_admin_only on public.mitarbeiter_verguetung
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Backfill aus profiles (nur Zeilen mit mind. einem HR-Feld gesetzt).
insert into public.mitarbeiter_verguetung (profile_id, gehalt_brutto, gehaltsstufe, position, eingestellt_am)
select id, gehalt_brutto, gehaltsstufe, position, eingestellt_am
from public.profiles
where gehalt_brutto is not null or gehaltsstufe is not null or position is not null or eingestellt_am is not null
on conflict (profile_id) do nothing;
