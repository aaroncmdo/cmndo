-- Backing-RPC fuer den Authenticated-Write-Reachability-Ratchet (Gegenstueck zu
-- audit_anon_reachable_pii). Liefert alle PERMISSIVE authenticated-WRITE-Policies
-- (INSERT/UPDATE/DELETE) auf Tabellen, wo authenticated den jeweiligen Write-Grant hat,
-- mit dem reachability-relevanten Ausdruck (INSERT->with_check das die neue Zeile gatet;
-- UPDATE/DELETE->qual das gatet WELCHE Zeilen getroffen werden). Der Scanner
-- (scripts/lib/authenticated-write-scan.mjs) flaggt Policies, deren Ausdruck einen
-- top-level-OR-Zweig OHNE auth.uid()/Scoping-Helper hat = jeder eingeloggte User kann
-- fremde/beliebige Zeilen schreiben (cross-user/cross-tenant Write). service_role-only.
create or replace function public.audit_authenticated_write_reachable()
returns table(table_name text, policy_name text, cmd text, check_expr text)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select
    c.relname::text as table_name,
    p.polname::text as policy_name,
    (case p.polcmd when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' end) as cmd,
    (case p.polcmd
       when 'a' then pg_get_expr(p.polwithcheck, p.polrelid)::text
       else pg_get_expr(p.polqual, p.polrelid)::text
     end) as check_expr
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_roles r on r.oid = any(p.polroles)
  where n.nspname = 'public'
    and r.rolname = 'authenticated'
    and p.polcmd in ('a', 'w', 'd')
    and p.polpermissive
    and has_table_privilege('authenticated', c.oid,
          (case p.polcmd when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' end));
$function$;

revoke execute on function public.audit_authenticated_write_reachable() from public, anon, authenticated;
grant execute on function public.audit_authenticated_write_reachable() to service_role;
