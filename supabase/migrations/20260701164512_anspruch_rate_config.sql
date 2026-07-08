-- Anspruch-pruefen Tool: DB-getriebene Rate-/Config-Referenzdaten (jaehrlich pflegbar).
-- Werte sind ILLUSTRATIVE vereinfachte Baender (nicht 1:1 Sanden-Danner) -> vor Live legal/fachlich pruefen.
create table if not exists public.nutzungsausfall_segment_saetze (
  segment text primary key,
  tagessatz_min_eur numeric not null,
  tagessatz_max_eur numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.wertminderung_alter_faktoren (
  alter_bis_jahre integer primary key,
  faktor_min numeric not null,
  faktor_max numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.anspruch_config (
  key text primary key,
  wert numeric not null,
  created_at timestamptz not null default now()
);

alter table public.nutzungsausfall_segment_saetze enable row level security;
alter table public.wertminderung_alter_faktoren enable row level security;
alter table public.anspruch_config enable row level security;

-- Referenzdaten: fuer alle lesbar (auch anon, da Pre-Auth-Tool); Schreiben nur service_role.
grant select on public.nutzungsausfall_segment_saetze to anon, authenticated;
grant select on public.wertminderung_alter_faktoren to anon, authenticated;
grant select on public.anspruch_config to anon, authenticated;

drop policy if exists nasaetze_read on public.nutzungsausfall_segment_saetze;
create policy nasaetze_read on public.nutzungsausfall_segment_saetze for select to anon, authenticated using (true);
drop policy if exists wmfaktoren_read on public.wertminderung_alter_faktoren;
create policy wmfaktoren_read on public.wertminderung_alter_faktoren for select to anon, authenticated using (true);
drop policy if exists anspruchconfig_read on public.anspruch_config;
create policy anspruchconfig_read on public.anspruch_config for select to anon, authenticated using (true);

insert into public.nutzungsausfall_segment_saetze (segment, tagessatz_min_eur, tagessatz_max_eur) values
  ('kleinwagen', 29, 35),
  ('kompakt', 38, 43),
  ('mittelklasse', 50, 59),
  ('oberklasse', 65, 79),
  ('suv', 59, 79),
  ('transporter', 50, 65)
on conflict (segment) do nothing;

insert into public.wertminderung_alter_faktoren (alter_bis_jahre, faktor_min, faktor_max) values
  (2, 0.15, 0.30),
  (5, 0.05, 0.15)
on conflict (alter_bis_jahre) do nothing;

insert into public.anspruch_config (key, wert) values
  ('kostenpauschale_eur', 30),
  ('wertminderung_min_reparatur_eur', 750),
  ('wertminderung_max_alter_jahre', 5),
  ('bagatelle_schwelle_eur', 750),
  ('abschlepp_min_eur', 150),
  ('abschlepp_max_eur', 350),
  ('dauer_leicht_min_tage', 2),
  ('dauer_leicht_max_tage', 4),
  ('dauer_mittel_min_tage', 5),
  ('dauer_mittel_max_tage', 9),
  ('dauer_schwer_min_tage', 10),
  ('dauer_schwer_max_tage', 21)
on conflict (key) do nothing;
