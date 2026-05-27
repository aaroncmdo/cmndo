create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  categories jsonb not null,
  policy_version text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
-- Insert-only fuer anon/authenticated (Audit-Daten, kein Lesen ueber die API).
alter table public.consent_records enable row level security;
create policy consent_records_insert on public.consent_records
  for insert to anon, authenticated with check (true);
