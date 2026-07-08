-- AI-Redaktions-Loop: Themen-Backlog + Artikel. Nur veroeffentlichte Artikel sind
-- oeffentlich lesbar (Marketing-Render + Feed); Drafts/Themen nur via service-role (Admin).
create table public.wissen_themen (
  id uuid primary key default gen_random_uuid(),
  titel text not null,
  kurzbrief text,
  begruendung text,
  primary_keyword text,
  cluster text,
  artikel_typ text,
  status text not null default 'vorgeschlagen'
    check (status in ('vorgeschlagen','freigegeben','abgelehnt','entwurf_erstellt')),
  quelle text not null default 'ai_gap' check (quelle in ('ai_gap','manuell')),
  entschieden_von uuid,
  entschieden_am timestamptz,
  created_at timestamptz not null default now()
);

create table public.wissen_artikel (
  id uuid primary key default gen_random_uuid(),
  thema_id uuid references public.wissen_themen(id) on delete set null,
  slug text unique not null check (slug ~ '^[a-z0-9-]{3,80}$'),
  title text not null,
  body text not null,
  excerpt text,
  key_facts text[] not null default '{}',
  meta_description text,
  primary_keyword text,
  cluster text,
  artikel_typ text,
  status text not null default 'entwurf'
    check (status in ('entwurf','in_review','veroeffentlicht','abgelehnt','archiviert')),
  author text not null default 'aaron-sprafke',
  ai_generated boolean not null default true,
  ai_model text,
  reviewed_von uuid,
  reviewed_am timestamptz,
  veroeffentlicht_am timestamptz,
  last_modified date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wissen_artikel_status_idx on public.wissen_artikel(status);
create index wissen_artikel_thema_idx on public.wissen_artikel(thema_id);

alter table public.wissen_themen enable row level security;
alter table public.wissen_artikel enable row level security;

grant select on public.wissen_artikel to anon, authenticated;
create policy wissen_artikel_public_read on public.wissen_artikel
  for select to anon, authenticated using (status = 'veroeffentlicht');
