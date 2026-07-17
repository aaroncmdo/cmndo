-- profiles OAuth-Token-Auslagerung Schritt 1 (additiver Grundstein, 17.07.2026).
-- Zweck: google/ms access+refresh Tokens (+ expiry) aus profiles in eine service-role-only
-- Tabelle verlagern. Fund (audit-authenticated-oauth-crosstenant-write): staff_read_all-Policy
-- (is_staff()=admin/kb/dispatch, 11 Accounts) laesst JEDEN Staff via authenticated-column-grant
-- ALLE OAuth-Refresh-Tokens lesen = persistenter Google/MS-Kontozugriff (3 aktiv befuellt).
-- Auslagern statt Column-Cap (Aaron-Entscheid), weil profiles die auth-kritischste Tabelle ist
-- (Cap = revoke+re-grant ~90 benigne Spalten, ein Fehler bricht app-weit jeden profiles-Read).
--
-- REIN ADDITIV: neue Tabelle + RLS + Backfill + Dual-Write-Trigger. Kein bestehender Code,
-- keine Spalte, keine Policy beruehrt -> 0 Kollision. Tokens/Consumer alle service_role.
-- profiles NICHT in supabase_realtime -> kein CDC-Risiko.
--
-- ⚠ Supabase Default-Privileges granten anon+authenticated automatisch -> explizit revoken
-- (sonst waere die Secret-Tabelle authenticated-lesbar = derselbe Leak nochmal).
-- lock_timeout niedrig: profiles ist die heisseste Tabelle (jeder Request) -> CREATE TRIGGER
-- nie blockieren lassen.

set local lock_timeout = '5s';
set local statement_timeout = '40s';

create table public.profiles_oauth_secrets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  google_access_token text,
  google_refresh_token text,
  google_token_expires_at timestamptz,
  ms_access_token text,
  ms_refresh_token text,
  ms_token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.profiles_oauth_secrets enable row level security;

-- Service-role-only: keine Policy (RLS-on + 0 Policies = deny-all fuer anon/authenticated;
-- service_role bypasst RLS). Default-Privilege-Grants entziehen (kein authenticated/anon-Zugriff).
revoke all on public.profiles_oauth_secrets from anon;
revoke all on public.profiles_oauth_secrets from authenticated;

-- Backfill (alle Profile mit mind. einem non-null OAuth-Feld).
insert into public.profiles_oauth_secrets
  (user_id, google_access_token, google_refresh_token, google_token_expires_at,
   ms_access_token, ms_refresh_token, ms_token_expires_at)
  select id, google_access_token, google_refresh_token, google_token_expires_at,
         ms_access_token, ms_refresh_token, ms_token_expires_at
  from public.profiles
  where google_access_token is not null or google_refresh_token is not null
     or ms_access_token is not null or ms_refresh_token is not null
  on conflict (user_id) do update set
    google_access_token = excluded.google_access_token,
    google_refresh_token = excluded.google_refresh_token,
    google_token_expires_at = excluded.google_token_expires_at,
    ms_access_token = excluded.ms_access_token,
    ms_refresh_token = excluded.ms_refresh_token,
    ms_token_expires_at = excluded.ms_token_expires_at,
    updated_at = now();

-- Dual-Write-Trigger: haelt secrets synchron waehrend des Cutovers (Reader koennen auf secrets
-- umgehaengt werden, bevor alle Writer umgestellt sind). Feuert nur bei Aenderung eines der 6 Felder.
create or replace function public.sync_profiles_oauth_secrets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.google_access_token is null and new.google_refresh_token is null
     and new.ms_access_token is null and new.ms_refresh_token is null then
    -- alle Tokens geleert (Disconnect) -> secrets-Row entfernen
    delete from public.profiles_oauth_secrets where user_id = new.id;
    return new;
  end if;
  insert into public.profiles_oauth_secrets
    (user_id, google_access_token, google_refresh_token, google_token_expires_at,
     ms_access_token, ms_refresh_token, ms_token_expires_at, updated_at)
  values (new.id, new.google_access_token, new.google_refresh_token, new.google_token_expires_at,
          new.ms_access_token, new.ms_refresh_token, new.ms_token_expires_at, now())
  on conflict (user_id) do update set
    google_access_token = excluded.google_access_token,
    google_refresh_token = excluded.google_refresh_token,
    google_token_expires_at = excluded.google_token_expires_at,
    ms_access_token = excluded.ms_access_token,
    ms_refresh_token = excluded.ms_refresh_token,
    ms_token_expires_at = excluded.ms_token_expires_at,
    updated_at = now();
  return new;
end;
$$;

create trigger trg_sync_profiles_oauth_secrets_ins
  after insert on public.profiles
  for each row
  when (new.google_access_token is not null or new.google_refresh_token is not null
        or new.ms_access_token is not null or new.ms_refresh_token is not null)
  execute function public.sync_profiles_oauth_secrets();

create trigger trg_sync_profiles_oauth_secrets_upd
  after update on public.profiles
  for each row
  when (old.google_access_token is distinct from new.google_access_token
        or old.google_refresh_token is distinct from new.google_refresh_token
        or old.google_token_expires_at is distinct from new.google_token_expires_at
        or old.ms_access_token is distinct from new.ms_access_token
        or old.ms_refresh_token is distinct from new.ms_refresh_token
        or old.ms_token_expires_at is distinct from new.ms_token_expires_at)
  execute function public.sync_profiles_oauth_secrets();

do $$
begin
  if has_table_privilege('anon', 'public.profiles_oauth_secrets', 'SELECT') then
    raise exception 'FAIL: anon hat SELECT auf profiles_oauth_secrets';
  end if;
  if has_table_privilege('authenticated', 'public.profiles_oauth_secrets', 'SELECT') then
    raise exception 'FAIL: authenticated hat SELECT auf profiles_oauth_secrets (Leak nicht geschlossen)';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.profiles_oauth_secrets'::regclass) then
    raise exception 'FAIL: RLS nicht aktiviert';
  end if;
  raise notice 'OK: profiles_oauth_secrets Grundstein (service-role-only, kein anon/authenticated).';
end $$;
