-- AAR-auth-haertung (Befund H): App-seitiges 2FA-Verify-Lockout (Defense-in-depth
-- ueber GoTrues Provider-Rate-Limit). Nur service-role (RLS enabled, keine policy
-- -> authenticated/anon deny-all; createAdminClient bypasst RLS).
create table if not exists public.auth_2fa_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failed_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.auth_2fa_attempts enable row level security;

comment on table public.auth_2fa_attempts is
  'AAR-auth-haertung (H): App-seitiges 2FA-Verify-Lockout. Nur service-role (RLS, keine policy).';
