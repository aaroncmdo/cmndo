-- AAR-694: SV-Kalender-Integration.
-- Drei Felder auf gutachter_termine für den Google-Calendar-Event-Sync im
-- SV-Kalender:
--   - google_event_id: Event-ID im SV-Kalender (NULL wenn noch nicht synced
--     oder wenn SV nicht mit Google verbunden ist)
--   - google_calendar_id: meistens 'primary', brauchen wir für delete/update
--   - google_event_synced_at: Zeitstempel des letzten erfolgreichen Syncs
--
-- Analog zu termine.google_event_id/calendar_id/event_synced_at, die vom
-- KB-Videotermin-Flow (AAR-95) genutzt werden.

ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS google_event_synced_at timestamp with time zone;

COMMENT ON COLUMN public.gutachter_termine.google_event_id IS
  'AAR-694: Google-Calendar-Event-ID im Kalender des SV. NULL wenn SV nicht per OAuth verbunden oder Sync fehlgeschlagen.';
COMMENT ON COLUMN public.gutachter_termine.google_calendar_id IS
  'AAR-694: Calendar-ID (meist ''primary'') fuer delete/update-Calls. Redundant zu google_event_id, aber macht das Loeschen autark.';
COMMENT ON COLUMN public.gutachter_termine.google_event_synced_at IS
  'AAR-694: Zeitstempel des letzten erfolgreichen create/update. NULL wenn noch nie synced.';
