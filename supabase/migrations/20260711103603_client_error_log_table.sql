-- CMM-14 Observability: capture client-side / RSC error-boundary hits so the
-- exact digest+stack of the next "lila root crash" is queryable (no Sentry
-- access needed). Written ONLY by the /api/client-error route handler via the
-- service-role client (bypasses RLS); staff may read.
create table if not exists public.client_error_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  boundary text not null,            -- 'root' | 'global' | 'login'
  digest text,
  name text,
  message text,
  stack text,
  pathname text,
  user_agent text,
  user_id uuid,
  rolle text
);

create index if not exists client_error_log_created_at_idx
  on public.client_error_log (created_at desc);

alter table public.client_error_log enable row level security;

-- Inserts laufen ausschliesslich ueber den Route-Handler mit Service-Role
-- (bypasst RLS) -> KEINE insert-Policy fuer anon/authenticated. Nur Staff liest.
create policy "client_error_log staff read"
  on public.client_error_log for select
  to authenticated
  using (public.is_staff());
