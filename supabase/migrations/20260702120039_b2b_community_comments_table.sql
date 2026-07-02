-- Design-Korrektur (FK-Check): article_comments.author_id -> community_profiles (Username-
-- Format ^[a-z0-9_-]{3,24}$). B2B-Kommentare (Partner=Firma / Admin) passen dort nicht rein.
-- Daher bleibt article_comments PUR (oeffentliche /wissen-Consumer-Kommentare, pre-moderiert),
-- und die B2B-Community bekommt eine eigene self-contained Tabelle community_comments.

-- 1) Task-1-Polymorphie an article_comments zuruecknehmen (live-Feature unveraendert)
alter table public.article_comments drop constraint if exists article_comments_target_chk;
alter table public.article_comments drop column if exists target_kind;
alter table public.article_comments drop column if exists post_id;
alter table public.article_comments alter column article_slug set not null;

-- 2) community_comments: Kommentare auf community_posts ODER b2b-wissen-Artikel; Threads (1 Ebene)
create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('post','wissen')),
  target_id uuid not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_kind text not null check (author_kind in ('partner','public','admin')),
  author_display text not null,
  body text not null check (char_length(body) between 1 and 2000),
  parent_id uuid references public.community_comments(id) on delete cascade,
  status text not null default 'sichtbar' check (status in ('sichtbar','versteckt','geloescht')),
  report_count int not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  moderated_von uuid,
  moderated_am timestamptz
);
create index community_comments_target_idx on public.community_comments(target_kind, target_id, created_at);
create index community_comments_parent_idx on public.community_comments(parent_id);
alter table public.community_comments enable row level security;
grant select on public.community_comments to anon, authenticated;
create policy community_comments_public_read on public.community_comments
  for select to anon, authenticated using (status='sichtbar');
