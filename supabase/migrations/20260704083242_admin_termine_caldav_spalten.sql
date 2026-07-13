-- SP2d: CalDAV-Sync-Spalten fuer admin_termine (Rueckrufe), spiegelt die vorhandenen
-- google_event_id/google_calendar_id/google_event_synced_at. Additiv, nullable.
alter table admin_termine
  add column if not exists caldav_object_url text,
  add column if not exists caldav_event_uid text,
  add column if not exists caldav_synced_at timestamptz;
