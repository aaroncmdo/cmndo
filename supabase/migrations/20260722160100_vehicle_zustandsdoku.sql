-- B (Fahrzeug-Zustandsdoku / Foto-Scan v1): Scans + Fotos + Bucket.
-- Neue Tabellen RLS-enabled + policy-los = deny-all fuer anon/authenticated (service_role
-- bypasst). Kein Grant/Policy -> Default-Privileg-Wurzel (#4555) haelt sie geschlossen.
create table public.vehicle_scans (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid,
  kilometerstand integer,
  status text not null default 'offen' check (status in ('offen','abgeschlossen')),
  notiz text
);
create index vehicle_scans_vehicle_idx on public.vehicle_scans (vehicle_id, erstellt_am desc);
alter table public.vehicle_scans enable row level security;

create table public.vehicle_scan_fotos (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.vehicle_scans(id) on delete cascade,
  storage_path text not null,
  perspektive text not null check (perspektive in
    ('front','heck','seite_links','seite_rechts','ecke_vl','ecke_vr','ecke_hl','ecke_hr','tacho','nahaufnahme')),
  ist_nahaufnahme boolean not null default false,
  vorschaden_id uuid references public.vehicle_vorschaeden(id) on delete set null,
  reihenfolge integer,
  erstellt_am timestamptz not null default now()
);
create index vehicle_scan_fotos_scan_idx on public.vehicle_scan_fotos (scan_id);
alter table public.vehicle_scan_fotos enable row level security;

alter table public.vehicle_vorschaeden add column scan_id uuid references public.vehicle_scans(id) on delete set null;

insert into storage.buckets (id, name, public) values ('fahrzeug-zustand','fahrzeug-zustand', false)
  on conflict (id) do nothing;
