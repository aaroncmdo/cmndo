-- Anspruch-Totalschaden Phase 1: WBW-Heuristik-Tabelle + Schwellen-Config
-- Applied via Supabase plugin apply_migration (Regel 2); tracked version 20260704100012.
-- Additive only (create table if not exists, on conflict do nothing) — safe drift direction.
-- NOTE: WBW-Baender sind illustrativ — vor Go-Live fachlich pruefen.

create table if not exists public.wbw_segment_alter (
  segment text not null,
  alter_bis_jahre integer not null,
  wbw_min_eur numeric not null,
  wbw_max_eur numeric not null,
  restwert_faktor numeric not null,
  created_at timestamptz not null default now(),
  primary key (segment, alter_bis_jahre)
);
alter table public.wbw_segment_alter enable row level security;
grant select on public.wbw_segment_alter to anon, authenticated;
drop policy if exists wbwsa_read on public.wbw_segment_alter;
create policy wbwsa_read on public.wbw_segment_alter for select to anon, authenticated using (true);

insert into public.wbw_segment_alter (segment, alter_bis_jahre, wbw_min_eur, wbw_max_eur, restwert_faktor) values
  ('kleinwagen',3,9000,15000,0.30),('kleinwagen',8,4000,9000,0.25),('kleinwagen',99,1500,4000,0.20),
  ('kompakt',3,14000,22000,0.30),('kompakt',8,7000,14000,0.25),('kompakt',99,2500,7000,0.20),
  ('mittelklasse',3,20000,32000,0.30),('mittelklasse',8,10000,20000,0.25),('mittelklasse',99,3500,10000,0.20),
  ('oberklasse',3,35000,60000,0.32),('oberklasse',8,16000,35000,0.27),('oberklasse',99,6000,16000,0.22),
  ('suv',3,26000,45000,0.32),('suv',8,13000,26000,0.27),('suv',99,5000,13000,0.22),
  ('transporter',3,20000,35000,0.30),('transporter',8,9000,20000,0.25),('transporter',99,3000,9000,0.20)
on conflict do nothing;

insert into public.anspruch_config (key, wert) values
  ('totalschaden_schwelle_prozent',90),('reparatur_grenze_prozent',130),
  ('wiederbeschaffungsdauer_min_tage',10),('wiederbeschaffungsdauer_max_tage',14)
on conflict (key) do nothing;
