-- SP5d: Outlook-Event-Idempotenz-Anker fuer admin_termine (Rueckrufe), wie caldav_object_url
-- / google_event_id. Additiv, nullable. Graph Default-Kalender -> kein ms_calendar_id.
alter table admin_termine add column if not exists ms_event_id text;
