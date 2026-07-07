-- Phase 1 Claim-Chat-Rebuild: Thread-Schema. Reihenfolge: Tabellen -> Helper -> RLS/Policies.

-- chat_threads (Tabelle zuerst; SELECT-Policy kommt nach dem Helper)
create table if not exists public.chat_threads (
  id            uuid primary key default gen_random_uuid(),
  claim_id      uuid not null references public.claims(id) on delete cascade,
  art           text not null check (art in ('kunde_gruppe','team_intern','direkt')),
  direkt_user_a uuid,
  direkt_user_b uuid,
  erstellt_am   timestamptz not null default now(),
  constraint chat_threads_direkt_paar_chk
    check ((art = 'direkt') = (direkt_user_a is not null and direkt_user_b is not null)),
  constraint chat_threads_direkt_sortiert_chk
    check (direkt_user_a is null or direkt_user_a < direkt_user_b)
);
create unique index if not exists chat_threads_gruppe_uniq
  on public.chat_threads (claim_id, art) where art in ('kunde_gruppe','team_intern');
create unique index if not exists chat_threads_direkt_uniq
  on public.chat_threads (claim_id, direkt_user_a, direkt_user_b) where art = 'direkt';
create index if not exists chat_threads_claim_idx on public.chat_threads (claim_id);

-- chat_thread_teilnehmer (FK -> chat_threads)
create table if not exists public.chat_thread_teilnehmer (
  thread_id          uuid not null references public.chat_threads(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  rolle              text,
  zuletzt_gelesen_am timestamptz,
  hinzugefuegt_am    timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index if not exists chat_thread_teilnehmer_user_idx on public.chat_thread_teilnehmer (user_id);

-- Membership-Helper (SECURITY DEFINER -> rekursionsfrei; NACH chat_thread_teilnehmer)
create or replace function public.ist_chat_teilnehmer(p_thread_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.chat_thread_teilnehmer t
    where t.thread_id = p_thread_id and t.user_id = auth.uid()
  );
$$;
revoke all on function public.ist_chat_teilnehmer(uuid) from anon;
grant execute on function public.ist_chat_teilnehmer(uuid) to authenticated;

-- RLS + Grants + Policies
alter table public.chat_threads enable row level security;
revoke all on public.chat_threads from anon;
grant select, insert on public.chat_threads to authenticated;
create policy chat_threads_select on public.chat_threads for select to authenticated
  using (public.is_staff() or public.ist_chat_teilnehmer(id));
create policy chat_threads_insert on public.chat_threads for insert to authenticated
  with check (public.is_staff());

alter table public.chat_thread_teilnehmer enable row level security;
revoke all on public.chat_thread_teilnehmer from anon;
grant select, insert, update on public.chat_thread_teilnehmer to authenticated;
create policy chat_teilnehmer_select on public.chat_thread_teilnehmer for select to authenticated
  using (public.is_staff() or user_id = auth.uid());
create policy chat_teilnehmer_insert on public.chat_thread_teilnehmer for insert to authenticated
  with check (public.is_staff());
create policy chat_teilnehmer_update_own on public.chat_thread_teilnehmer for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
