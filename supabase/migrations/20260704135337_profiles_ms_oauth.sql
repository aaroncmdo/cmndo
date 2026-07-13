-- SP5a: Microsoft-OAuth-Tokens fuer Outlook-Kalender-Sync, mirror von profiles.google_*.
-- Additiv, nullable. Env-gated genutzt (MICROSOFT_OAUTH_CLIENT_ID/SECRET).
alter table profiles
  add column if not exists ms_refresh_token text,
  add column if not exists ms_access_token text,
  add column if not exists ms_token_expires_at timestamptz,
  add column if not exists ms_email text,
  add column if not exists ms_connected_at timestamptz;
