-- Schritt 3 der profiles-OAuth-Token-Auslagerung: schliesst das HIGH-Leck.
-- Die Tokens leben jetzt ausschliesslich in profiles_oauth_secrets (service-role-only);
-- der Consumer-Cutover (#4574, prod-verifiziert via Regel-4-Smoke 18.07.) liest/schreibt nur noch dort.
-- Diese Migration entfernt die redundanten, jetzt eingefrorenen Token-Spalten aus profiles
-- (die JEDER Staff via staff_read_all lesen konnte) + den Dual-Write-Trigger (nach Cutover no-op).
-- 0 Code-Straggler verifiziert; kein View haengt an den Spalten (dependent_views=null).
set local lock_timeout = '5s';

drop trigger if exists trg_sync_profiles_oauth_secrets_ins on public.profiles;
drop trigger if exists trg_sync_profiles_oauth_secrets_upd on public.profiles;
drop function if exists public.sync_profiles_oauth_secrets();

alter table public.profiles
  drop column if exists google_access_token,
  drop column if exists google_refresh_token,
  drop column if exists google_token_expires_at,
  drop column if exists ms_access_token,
  drop column if exists ms_refresh_token,
  drop column if exists ms_token_expires_at;
