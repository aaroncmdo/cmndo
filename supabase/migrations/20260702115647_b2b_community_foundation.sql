-- B2B-Community-Feed: UGC-Posts + Likes + polymorphe Kommentare (Ziel wissen ODER post)
-- + wissen_artikel-Audience/Quelle/Tags. Posts nur via RPC insertbar (Task 2); nur
-- sichtbare Posts oeffentlich lesbar. Consumer-/wissen-Kommentare bleiben unveraendert.
create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_kind text not null check (author_kind in ('partner','public','admin')),
  author_display text not null,
  body text not null check (char_length(body) between 1 and 5000),
  tags text[] not null default '{}',
  status text not null default 'sichtbar' check (status in ('sichtbar','versteckt','geloescht')),
  report_count int not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  moderated_von uuid,
  moderated_am timestamptz
);
create index community_posts_status_created_idx on public.community_posts(status, created_at desc);
create index community_posts_tags_idx on public.community_posts using gin(tags);

create table public.community_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_kind text not null check (target_kind in ('post','wissen','comment')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, target_kind, target_id)
);
create index community_likes_target_idx on public.community_likes(target_kind, target_id);

alter table public.article_comments alter column article_slug drop not null;
alter table public.article_comments add column post_id uuid references public.community_posts(id) on delete cascade;
alter table public.article_comments add column target_kind text not null default 'wissen' check (target_kind in ('wissen','post'));
alter table public.article_comments add constraint article_comments_target_chk
  check ((target_kind='wissen' and article_slug is not null and post_id is null)
      or (target_kind='post'   and post_id is not null and article_slug is null));

alter table public.wissen_artikel add column audience text not null default 'consumer' check (audience in ('consumer','b2b'));
alter table public.wissen_artikel add column quelle text not null default 'redaktion' check (quelle in ('redaktion','crawl'));
alter table public.wissen_artikel add column tags text[] not null default '{}';

alter table public.community_posts enable row level security;
alter table public.community_likes enable row level security;
grant select on public.community_posts to anon, authenticated;
grant select on public.community_likes to anon, authenticated;
grant insert, delete on public.community_likes to authenticated;
create policy community_posts_public_read on public.community_posts for select to anon, authenticated using (status='sichtbar');
create policy community_likes_read on public.community_likes for select to anon, authenticated using (true);
create policy community_likes_own_insert on public.community_likes for insert to authenticated with check (user_id = auth.uid());
create policy community_likes_own_delete on public.community_likes for delete to authenticated using (user_id = auth.uid());
