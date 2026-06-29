-- Community-Kommentare Foundation: Profile + Kommentare + RLS (Spec 2026-06-29-artikel-kommentare).
-- Nur Kommentare (keine User-Artikel). RLS-Haertung: Insert/Update erzwingen status='pending'
-- (keine Self-Approval); kein Profil-Self-Update (is_blocked/trusted nur via Admin/Plan 3).

create type comment_status as enum ('pending','approved','rejected','hidden');

create table public.community_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique,
  consent_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  is_blocked  boolean not null default false,
  trusted     boolean not null default false,
  constraint username_format check (username ~ '^[a-z0-9_-]{3,24}$')
);

create table public.article_comments (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.community_profiles(user_id) on delete cascade,
  article_slug  text not null,
  body          text not null,
  status        comment_status not null default 'pending',
  parent_id     uuid references public.article_comments(id) on delete cascade,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz,
  moderated_by  uuid references auth.users(id),
  moderated_at  timestamptz,
  constraint body_length check (char_length(body) between 1 and 2000)
);

create index article_comments_by_article on public.article_comments (article_slug, status, created_at desc);
create index article_comments_by_author on public.article_comments (author_id);

alter table public.community_profiles enable row level security;
alter table public.article_comments  enable row level security;

grant select on public.community_profiles to anon, authenticated;
grant insert on public.community_profiles to authenticated;
grant select on public.article_comments to anon;
grant select, insert, update, delete on public.article_comments to authenticated;

-- community_profiles: username oeffentlich lesbar; eigenes Profil einmal anlegen.
-- KEIN Self-Update (sonst koennte man is_blocked/trusted selbst setzen) -> Admin in Plan 3.
create policy profiles_select_all on public.community_profiles
  for select using (true);
create policy profiles_insert_own on public.community_profiles
  for insert with check (auth.uid() = user_id);

-- article_comments: oeffentlich nur 'approved'; eigene immer; Insert/Update erzwingen 'pending'.
create policy comments_select_approved_or_own on public.article_comments
  for select using (status = 'approved' or author_id = auth.uid());
create policy comments_insert_own_pending on public.article_comments
  for insert with check (
    auth.uid() = author_id
    and status = 'pending'
    and not exists (select 1 from public.community_profiles p where p.user_id = auth.uid() and p.is_blocked)
  );
create policy comments_update_own_pending on public.article_comments
  for update using (author_id = auth.uid())
  with check (author_id = auth.uid() and status = 'pending');
create policy comments_delete_own on public.article_comments
  for delete using (author_id = auth.uid());
