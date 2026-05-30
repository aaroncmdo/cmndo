-- pg_cron ist cluster-weit nur auf Prod/Staging installiert, NICHT in Supabase-
-- Preview-Branches oder lokalen From-Scratch-Replays. Dort existiert das Schema
-- "cron" nicht -> ungeguardetes cron.schedule(...) bricht den Migrations-Replay
-- mit SQLSTATE 3F000 ab. Daher das komplette Scheduling hinter einen cron-Schema-
-- Existenz-Check guarden. Auf Prod (cron vorhanden) bleibt das Verhalten 1:1:
-- alten Job idempotent entfernen, dann minuetlich schedulen (Snapshot nur bei
-- >=80% Auslastung). Auf Preview/lokal wird der Job sauber uebersprungen.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    -- alten Job mit gleichem Namen entfernen, falls vorhanden (idempotent)
    begin
      perform cron.unschedule('connection-snapshot-if-high');
    exception when others then
      null;
    end;

    perform cron.schedule(
      'connection-snapshot-if-high',
      '* * * * *',
      $cron$select monitoring.snapshot_connections_if_high();$cron$
    );
  else
    raise notice 'pg_cron nicht installiert - Cron-Job connection-snapshot-if-high uebersprungen (Preview/lokal)';
  end if;
end $$;
