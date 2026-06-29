-- LinkedIn Auto-Posting: ledger + Freigabe-Queue.
-- Applied via Supabase MCP apply_migration (Regel 2). Filename == recorded version.
create table public.linkedin_posts (
  id uuid primary key default gen_random_uuid(),
  feed_guid text not null unique,
  feed_url text not null,
  title text not null,
  excerpt text,
  composed_text text not null,
  status text not null default 'entwurf'
    check (status in ('entwurf','veroeffentlicht','fehlgeschlagen','uebersprungen')),
  author_urn text not null,
  linkedin_post_urn text,
  scheduled_for timestamptz,
  published_at timestamptz,
  freigegeben_von uuid references public.profiles(id),
  freigegeben_am timestamptz,
  fehler text,
  erstellt_am timestamptz not null default now()
);
create index linkedin_posts_status_idx on public.linkedin_posts (status);
alter table public.linkedin_posts enable row level security;
create policy linkedin_posts_admin_all on public.linkedin_posts
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rolle = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rolle = 'admin'));
