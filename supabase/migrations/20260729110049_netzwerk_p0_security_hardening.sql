-- P0 Security-Hardening (Review-Funde CRITICAL + IMPORTANT).
-- Fix 1 (Critical): profiles.netzwerk_owner_id/_seit nur via service_role/admin (Sticky First-Touch, K6).
--   profiles hat table-weiten authenticated-UPDATE-Grant + owner-Policy ("id=auth.uid() OR is_admin()")
--   -> sonst koennte jeder User seine eigene Attribution ueberschreiben. Spiegelt guard_profiles_rolle.
create or replace function public.guard_profiles_netzwerk_owner()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
declare
  privileged boolean := current_user in ('service_role', 'supabase_admin', 'postgres', 'authenticator')
                        or public.is_admin();
begin
  if not privileged and (
       new.netzwerk_owner_id is distinct from old.netzwerk_owner_id
    or new.netzwerk_owner_seit is distinct from old.netzwerk_owner_seit
  ) then
    raise exception 'Nur Admins/service_role duerfen netzwerk_owner_* setzen (Sticky First-Touch K6, profiles.%)', new.id
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger guard_profiles_netzwerk_owner_upd
  before update of netzwerk_owner_id, netzwerk_owner_seit on public.profiles
  for each row execute function public.guard_profiles_netzwerk_owner();

-- Fix 2 (Important): netzwerk_verbindungen-UPDATE nur durch den Empfaenger (Konsens) -> kein Self-Accept durch Anfrager.
drop policy netzwerk_verbindungen_update on public.netzwerk_verbindungen;
create policy netzwerk_verbindungen_update on public.netzwerk_verbindungen
  for update to authenticated
  using (empfaenger_id = auth.uid())
  with check (empfaenger_id = auth.uid());

-- Paar-Spalten immutable + Status nur aus 'offen' heraus (Antwort), danach terminal (Entfernen = DELETE, P1).
create or replace function public.guard_netzwerk_verbindung_update()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
declare
  privileged boolean := current_user in ('service_role', 'supabase_admin', 'postgres', 'authenticator')
                        or public.is_admin();
begin
  if not privileged then
    if new.anfrager_id is distinct from old.anfrager_id
       or new.empfaenger_id is distinct from old.empfaenger_id then
      raise exception 'netzwerk_verbindungen: anfrager_id/empfaenger_id sind unveraenderlich'
        using errcode = 'insufficient_privilege';
    end if;
    if old.status <> 'offen' and new.status is distinct from old.status then
      raise exception 'netzwerk_verbindungen: Status nur aus offen heraus aenderbar (% -> %)', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;
  if old.status = 'offen' and new.status <> 'offen' and new.beantwortet_am is null then
    new.beantwortet_am := now();
  end if;
  return new;
end;
$$;
create trigger guard_netzwerk_verbindung_upd
  before update on public.netzwerk_verbindungen
  for each row execute function public.guard_netzwerk_verbindung_update();
