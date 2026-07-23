-- Read-only RPC: liefert ALLE public ANY-ARRAY-enum-CHECKs als {"table.col": ["v1","v2",...]}.
-- Backing fuer scripts/build-flag-drift-snapshot.mjs (Cron regeneriert damit den
-- flag-drift-Snapshot ueber REST, ohne raw pg-Zugriff). service_role-only, wie audit_anon_*.
create or replace function public.audit_enum_check_constraints()
returns jsonb
language sql
security definer
set search_path = pg_catalog, pg_temp
stable
as $$
  select coalesce(jsonb_object_agg(key, vals), '{}'::jsonb)
  from (
    select distinct on (key)
      cls.relname || '.' || (regexp_match(pg_get_constraintdef(con.oid), '[(]([a-z_][a-z0-9_]*) = ANY'))[1] as key,
      (select jsonb_agg(m[1] order by m[1])
         from regexp_matches(pg_get_constraintdef(con.oid), '''([^'']+)''::', 'g') as m) as vals
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    where con.contype = 'c'
      and ns.nspname = 'public'
      and pg_get_constraintdef(con.oid) ilike '%= ANY (ARRAY[%'
      and (regexp_match(pg_get_constraintdef(con.oid), '[(]([a-z_][a-z0-9_]*) = ANY'))[1] is not null
    order by key
  ) sub;
$$;

revoke all on function public.audit_enum_check_constraints() from public;
grant execute on function public.audit_enum_check_constraints() to service_role;
