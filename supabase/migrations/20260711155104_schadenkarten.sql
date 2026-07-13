-- Schadenkarte: NFC+QR-Karte, 1:1 an ein Flotten-Fahrzeug. Spiegelt werkstatt_qr_pool
-- (Pool frei->gebunden). karten_token = Plaintext (auf Karte/QR sichtbar, kein Secret),
-- hoehere Entropie (SKT-<16>). URL: https://claimondo.de/schaden/{karten_token}.
-- Getrackte Version 20260711155104 (via plugin apply_migration).
create table if not exists public.schadenkarten (
  id uuid primary key default gen_random_uuid(),
  karten_token text not null unique,
  status text not null default 'bestellt' check (status in ('bestellt','frei','gebunden','gesperrt','ersetzt')),
  fahrzeug_id uuid references public.vehicles(id) on delete set null,
  firma_id uuid references public.firmen(id) on delete set null,
  nfc_uid text,
  charge text,
  gebunden_am timestamptz,
  gebunden_von uuid references auth.users(id) on delete set null,
  erstellt_am timestamptz not null default now()
);
create index if not exists idx_schadenkarten_fahrzeug on public.schadenkarten(fahrzeug_id);
create index if not exists idx_schadenkarten_firma on public.schadenkarten(firma_id);
-- 1:1 — max. eine GEBUNDENE Karte pro Fahrzeug:
create unique index if not exists schadenkarten_fahrzeug_gebunden_uniq
  on public.schadenkarten (fahrzeug_id) where status = 'gebunden';

alter table public.schadenkarten enable row level security;
-- RLS: flottenmanager sieht/updated Karten SEINER firma; Staff alles. (INSERT/mint via Admin-Client.)
create policy skt_fm_select on public.schadenkarten for select to authenticated
  using (firma_id = public.auth_flottenmanager_firma_id());
create policy skt_fm_update on public.schadenkarten for update to authenticated
  using (firma_id = public.auth_flottenmanager_firma_id())
  with check (firma_id = public.auth_flottenmanager_firma_id());
create policy skt_staff_all on public.schadenkarten for all to authenticated
  using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.rolle in ('admin','dispatch','kundenbetreuer')))
  with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.rolle in ('admin','dispatch','kundenbetreuer')));
revoke all on public.schadenkarten from anon;
grant select, update on public.schadenkarten to authenticated;
