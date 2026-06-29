-- LinkedIn Auto-Posting: OAuth token store (secrets).
-- RLS enabled with NO policy => deny-all; only service_role (bypasses RLS) reads/writes.
-- Applied via Supabase MCP apply_migration (Regel 2). Filename == recorded version.
create table public.linkedin_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_urn text not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  scope text,
  connected_by uuid references public.profiles(id),
  erstellt_am timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
alter table public.linkedin_oauth_tokens enable row level security;
