-- SP2a: kalender_verbindungen als SSoT. Die 5 Spalten ergaenzen, die sv_kalender_verbindungen
-- hat und Consumer (Connect-UI, Views, Healthcheck) brauchen. Alle nullable (Bestand hat sie nicht).
alter table kalender_verbindungen
  add column if not exists calendar_display_name text,
  add column if not exists provider_label text,
  add column if not exists connected_at timestamptz,
  add column if not exists last_sync_at timestamptz,
  add column if not exists fehler_task_id uuid;

-- Re-Backfill (idempotent): alle aktuellen sv_kalender_verbindungen -> kalender_verbindungen,
-- inkl. der 5 neuen Spalten. Faengt Verbindungen aus dem Fenster SP1-Backfill..SP2a-Deploy.
insert into kalender_verbindungen (
  profile_id, provider, server_url, username, password_encrypted, calendar_url,
  calendar_display_name, provider_label, connected_at, last_sync_at, last_error, last_error_at, fehler_task_id
)
select s.profile_id, v.provider, v.server_url, v.username, v.password_encrypted, v.calendar_url,
       v.calendar_display_name, v.provider_label, v.connected_at, v.last_sync_at, v.last_error, v.last_error_at, v.fehler_task_id
from sv_kalender_verbindungen v
join sachverstaendige s on s.id = v.sv_id
where s.profile_id is not null
on conflict (profile_id, provider) do update set
  server_url = excluded.server_url, username = excluded.username,
  password_encrypted = excluded.password_encrypted, calendar_url = excluded.calendar_url,
  calendar_display_name = excluded.calendar_display_name, provider_label = excluded.provider_label,
  connected_at = excluded.connected_at, last_sync_at = excluded.last_sync_at,
  last_error = excluded.last_error, last_error_at = excluded.last_error_at,
  fehler_task_id = excluded.fehler_task_id;
