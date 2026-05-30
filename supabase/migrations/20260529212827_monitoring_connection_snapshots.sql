-- Eigenes Schema, NICHT ueber die Data-API exponiert (kein RLS-Thema, kein API-Zugriff).
create schema if not exists monitoring;

create table if not exists monitoring.connection_snapshots (
  id                bigint generated always as identity primary key,
  erfasst_am        timestamptz not null default now(),
  belegt            int        not null,
  max_conn          int        not null,
  auslastung_proz   numeric(5,1) not null,
  aktiv             int        not null,
  idle              int        not null,
  idle_in_tx        int        not null,
  details           jsonb      not null
);

create index if not exists idx_conn_snapshots_zeit
  on monitoring.connection_snapshots (erfasst_am desc);

-- Schreibt nur dann einen Snapshot, wenn die Auslastung >= 80% liegt.
-- security definer, damit die Funktion alle Connections sieht; fixer search_path.
create or replace function monitoring.snapshot_connections_if_high()
returns void
language plpgsql
security definer
set search_path = pg_catalog, monitoring, public
as $$
declare
  v_max     int;
  v_belegt  int;
  v_ausl    numeric;
begin
  select setting::int into v_max from pg_settings where name = 'max_connections';
  select count(*) into v_belegt from pg_stat_activity where pid <> pg_backend_pid();
  v_ausl := round(v_belegt::numeric / v_max * 100, 1);

  if v_ausl >= 80 then
    insert into monitoring.connection_snapshots
      (belegt, max_conn, auslastung_proz, aktiv, idle, idle_in_tx, details)
    select
      v_belegt, v_max, v_ausl,
      count(*) filter (where state = 'active'),
      count(*) filter (where state = 'idle'),
      count(*) filter (where state = 'idle in transaction'),
      jsonb_agg(jsonb_build_object(
        'pid',          pid,
        'backend_type', backend_type,
        'anwendung',    coalesce(nullif(application_name,''),'(leer)'),
        'client',       coalesce(host(client_addr),'lokal'),
        'state',        state,
        'wait_type',    wait_event_type,
        'wait_event',   wait_event,
        'idle_sek',     round(extract(epoch from (now()-state_change)))::int,
        'query',        left(query, 200)
      ) order by state_change)
    from pg_stat_activity
    where pid <> pg_backend_pid();
  end if;
end;
$$;
