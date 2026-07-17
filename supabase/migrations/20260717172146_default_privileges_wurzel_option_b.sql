-- WURZEL-Fix (Default-Privileges default-closed, Option B) — 17.07.2026, Aaron-Entscheid.
-- Problem: Supabase Default-Privileges granten anon+authenticated automatisch arwdDxtm (ALLES) auf
-- JEDE neue public-Tabelle (erzeugt von postgres) -> Quelle des 5x-wiederkehrenden Grant-Problems
-- (anon-SELECT R3, anon-Write-Cap, authenticated-OAuth-Klasse). Jeder Symptom-Fix erodiert sonst
-- mit der naechsten neuen Tabelle.
--
-- Migrationen laufen als postgres (verifiziert: current_user=postgres, App-Tabellen postgres-owned).
-- Daher genuegt `for role postgres` (supabase_admin-Default betrifft nur Supabase-interne Tabellen).
--
-- Option B (Aaron): anon = KOMPLETT default-closed; authenticated = default-closed auf WRITE
-- (INSERT/UPDATE/DELETE/TRUNCATE), SELECT bleibt (fast jede Tabelle braucht authenticated-Read).
-- Betrifft NUR zukuenftige Tabellen (pg_default_acl) — Bestand voellig unberuehrt, 0 Verhaltens-
-- Change jetzt. AB JETZT: neue Tabelle braucht EXPLIZITE Grants (broadcast-default-privileges...).
-- Funktionen/Sequenzen bewusst NICHT angetastet (anon-EXECUTE auf public-RPCs bleibt noetig).
--
-- Neuer Default-ACL fuer postgres/tables nach dieser Mig:
--   {postgres=arwdDxtm, authenticated=rxtm (nur SELECT+ref/trg/maint), service_role=arwdDxtm}  (anon: WEG)

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke insert, update, delete, truncate on tables from authenticated;

-- Selbst-verifizierend: neue Tabelle (als postgres) bekommt den neuen Default -> pruefen -> droppen.
create table public._dp_verify_tmp (id int);
do $$
begin
  if has_table_privilege('anon','public._dp_verify_tmp','SELECT') then raise exception 'FAIL: anon hat noch SELECT-Default'; end if;
  if has_table_privilege('anon','public._dp_verify_tmp','INSERT') then raise exception 'FAIL: anon hat noch INSERT-Default'; end if;
  if not has_table_privilege('authenticated','public._dp_verify_tmp','SELECT') then raise exception 'FAIL: authenticated SELECT-Default fehlt (zu strikt)'; end if;
  if has_table_privilege('authenticated','public._dp_verify_tmp','INSERT') then raise exception 'FAIL: authenticated hat noch INSERT-Default'; end if;
  if has_table_privilege('authenticated','public._dp_verify_tmp','UPDATE') then raise exception 'FAIL: authenticated hat noch UPDATE-Default'; end if;
  if has_table_privilege('authenticated','public._dp_verify_tmp','DELETE') then raise exception 'FAIL: authenticated hat noch DELETE-Default'; end if;
  raise notice 'OK: Default-Privileges Option B (anon=nichts, authenticated=nur SELECT auf neue Tabellen).';
end $$;
drop table public._dp_verify_tmp;
