-- Anonyme Schaetz-Session (KEINE PII bis Handoff). service_role-only (deny-all clients).
create table if not exists public.anspruch_schaetzungen (
  id uuid primary key default gen_random_uuid(),
  session_token text not null unique,
  foto_pfade jsonb not null default '[]'::jsonb,
  erkanntes_segment text,
  schweregrad text,
  fahrbereit boolean,
  ez_jahr integer,
  vision_result jsonb,
  positionen jsonb,
  lead_id uuid references public.leads(id) on delete set null,
  erstellt_am timestamptz not null default now()
);
create index if not exists idx_anspruch_schaetzungen_lead on public.anspruch_schaetzungen(lead_id);

alter table public.anspruch_schaetzungen enable row level security;
-- Kein grant an anon/authenticated: Zugriff ausschliesslich ueber service-role Server-Actions
-- (session_token = Capability). Keine Policy => deny-all fuer Clients.

alter table public.gutachter_finder_anfragen
  add column if not exists schaetzung_session_id uuid null references public.anspruch_schaetzungen(id) on delete set null;
