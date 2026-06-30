create table public.health_check_runs (
  id uuid primary key default gen_random_uuid(),
  check_id text not null,
  category text not null,
  status text not null check (status in ('ok','warn','crit','error')),
  metric numeric,
  detail text not null default '',
  sample_ids jsonb not null default '[]'::jsonb,
  alerted_at timestamptz,
  run_at timestamptz not null default now()
);
create index idx_health_runs_check_recent on public.health_check_runs (check_id, run_at desc);
create index idx_health_runs_recent on public.health_check_runs (run_at desc);
alter table public.health_check_runs enable row level security;
create policy "admin liest health_check_runs" on public.health_check_runs
  for select using (public.is_admin());
