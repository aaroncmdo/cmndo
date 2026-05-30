-- Alten Job mit gleichem Namen entfernen, falls vorhanden (idempotent).
do $$
begin
  perform cron.unschedule('connection-snapshot-if-high');
exception when others then
  null;
end $$;

-- Minuetlich pruefen; die Funktion schreibt nur bei >=80% Auslastung.
select cron.schedule(
  'connection-snapshot-if-high',
  '* * * * *',
  $cron$select monitoring.snapshot_connections_if_high();$cron$
);
