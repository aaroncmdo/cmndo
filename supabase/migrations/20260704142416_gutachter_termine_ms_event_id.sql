-- SP5b: Outlook-Event-Idempotenz-Anker fuer gutachter_termine (wie google_event_id).
-- Additiv, nullable. Graph nutzt den Default-Kalender (/me/events) -> kein ms_calendar_id.
alter table gutachter_termine add column if not exists ms_event_id text;
