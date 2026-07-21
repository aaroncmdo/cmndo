-- Incident 18.07.2026: Ein 14h-Netz-Outage brach die PITR-WAL-Archivierung.
-- Bei archive_mode=on kann Postgres WAL erst nach erfolgreichem Archivieren recyceln.
-- Folge: ~5 GB un-archivierte WAL stauten sich -> Volume voll -> Supabase-Auto-Read-only
-- -> App konnte 14h nicht schreiben. Der Zustand blieb die ganze Zeit unentdeckt.
-- Dieser Detektor macht ihn in < 10 Minuten sichtbar.
-- Bewusst DB-seitig (pg_cron): waehrend des Outages war die App unerreichbar, ein
-- App-Health-Check waere mit ausgefallen -- die Cron-Jobs liefen nachweislich weiter.

create table if not exists monitoring.wal_archiver_snapshots (
  id                  bigint generated always as identity primary key,
  erfasst_am          timestamptz not null default now(),
  schweregrad         text        not null check (schweregrad in ('warnung','kritisch')),
  grund               text        not null,
  wal_bytes           bigint      not null,
  wal_dateien         integer     not null,
  archiviert_gesamt   bigint      not null,
  fehlversuche_gesamt bigint      not null,
  letzter_erfolg_am   timestamptz,
  letzter_fehler_am   timestamptz,
  details             jsonb       not null
);

comment on table monitoring.wal_archiver_snapshots is
  'Schnappschuss bei stockender WAL-Archivierung. Leere Tabelle = gesund. Siehe Incident 18.07.2026 (Archiver-Stall -> WAL-Stau -> Disk voll -> Auto-Read-only).';

create index if not exists wal_archiver_snapshots_erfasst_am_idx
  on monitoring.wal_archiver_snapshots (erfasst_am desc);

-- Reiner Lese-Status: ad-hoc aufrufbar und fuer den App-Health-Check konsumierbar.
create or replace function monitoring.wal_archiver_status()
returns table (
  schweregrad         text,
  grund               text,
  wal_bytes           bigint,
  wal_dateien         integer,
  archiviert_gesamt   bigint,
  fehlversuche_gesamt bigint,
  letzter_erfolg_am   timestamptz,
  letzter_fehler_am   timestamptz
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'monitoring', 'public'
as $function$
declare
  v_wal_bytes bigint;
  v_wal_files integer;
  v_arch      record;
  v_sev       text := 'ok';
  v_grund     text := 'Archivierung laeuft';
  v_failing   boolean;
  v_stale_min numeric;
begin
  select coalesce(sum(w.size), 0)::bigint, count(*)::integer
    into v_wal_bytes, v_wal_files
    from pg_ls_waldir() w;

  select a.archived_count, a.failed_count, a.last_archived_time, a.last_failed_time
    into v_arch
    from pg_stat_archiver a;

  v_failing := v_arch.last_failed_time is not null
               and (v_arch.last_archived_time is null
                    or v_arch.last_failed_time > v_arch.last_archived_time);

  v_stale_min := extract(epoch from (now() - coalesce(v_arch.last_archived_time, now()))) / 60.0;

  if v_wal_bytes >= 3221225472 then
    v_sev   := 'kritisch';
    v_grund := 'WAL >= 3 GB - naehert sich max_wal_size, Volume-Risiko';
  elsif v_failing and v_wal_bytes >= 1610612736 then
    v_sev   := 'kritisch';
    v_grund := 'Archivierung schlaegt fehl UND WAL staut sich (> 1,5 GB)';
  elsif v_failing then
    v_sev   := 'warnung';
    v_grund := 'Letztes Archiver-Event war ein Fehlschlag';
  elsif v_stale_min > 30 and v_wal_bytes >= 1610612736 then
    v_sev   := 'warnung';
    v_grund := format('Seit %s Min kein erfolgreiches Archivieren bei gestautem WAL', round(v_stale_min));
  end if;

  return query
    select v_sev, v_grund, v_wal_bytes, v_wal_files,
           v_arch.archived_count, v_arch.failed_count,
           v_arch.last_archived_time, v_arch.last_failed_time;
end;
$function$;

-- Cron-Einstieg: schreibt nur, wenn NICHT ok (Muster von snapshot_connections_if_high).
create or replace function monitoring.snapshot_wal_archiver_if_failing()
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'monitoring', 'public'
as $function$
declare
  s record;
begin
  select * into s from monitoring.wal_archiver_status();

  if s.schweregrad = 'ok' then
    return;
  end if;

  insert into monitoring.wal_archiver_snapshots
    (schweregrad, grund, wal_bytes, wal_dateien,
     archiviert_gesamt, fehlversuche_gesamt, letzter_erfolg_am, letzter_fehler_am, details)
  values
    (s.schweregrad, s.grund, s.wal_bytes, s.wal_dateien,
     s.archiviert_gesamt, s.fehlversuche_gesamt, s.letzter_erfolg_am, s.letzter_fehler_am,
     jsonb_build_object(
       'wal_lesbar',   pg_size_pretty(s.wal_bytes),
       'max_wal_size', current_setting('max_wal_size'),
       'min_wal_size', current_setting('min_wal_size'),
       'archive_mode', current_setting('archive_mode')
     ));
end;
$function$;

-- Idempotent einplanen: alle 5 Minuten.
do $$
begin
  perform cron.unschedule('wal-archiver-alert');
exception
  when others then null;
end
$$;

select cron.schedule('wal-archiver-alert', '*/5 * * * *',
                     'select monitoring.snapshot_wal_archiver_if_failing();');
