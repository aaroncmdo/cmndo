-- AAR-716: CalDAV-Write-Spalten für gutachter_termine.
--
-- Analog zu google_event_id/google_calendar_id (AAR-694) brauchen wir für
-- CalDAV (Apple iCloud, Fastmail, Custom) drei Felder zum Tracking des
-- Kalender-Objekts:
--
--   caldav_object_url:  vollständige URL des iCalendar-Objekts auf dem
--                       Server (z. B. https://p123.caldav.icloud.com/.../
--                       <uid>.ics) — wird für PUT/DELETE benötigt.
--   caldav_event_uid:   iCal-UID (RFC5545) im VEVENT-Block. Wird beim
--                       Erstellen erzeugt und ist bei Update identisch.
--   caldav_synced_at:   Zeitpunkt des letzten erfolgreichen Sync.
--
-- Idempotenz: ist caldav_object_url gesetzt → PUT (Update). Sonst PUT auf
-- neue URL (Create). Beim Delete wird die Spalte auf NULL zurückgesetzt.
--
-- Fail-soft: Sync-Fehler dürfen den Termin-Flow nicht brechen — der Caller
-- wickelt die Sync-Funktion in try/catch.

ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS caldav_object_url text,
  ADD COLUMN IF NOT EXISTS caldav_event_uid text,
  ADD COLUMN IF NOT EXISTS caldav_synced_at timestamptz;

COMMENT ON COLUMN public.gutachter_termine.caldav_object_url IS
  'AAR-716: URL des iCal-Objekts auf dem CalDAV-Server (Apple iCloud / '
  'Fastmail / Custom). Für PUT (Update) und DELETE benötigt. NULL = noch '
  'nicht synchronisiert oder SV hat keine CalDAV-Verbindung.';

COMMENT ON COLUMN public.gutachter_termine.caldav_event_uid IS
  'AAR-716: iCal-UID (RFC5545) — UUID @ Domain. Bleibt über Updates '
  'identisch, wird vom Server zur Event-Identifikation genutzt.';

COMMENT ON COLUMN public.gutachter_termine.caldav_synced_at IS
  'AAR-716: Zeitstempel des letzten erfolgreichen CalDAV-Sync (Create '
  'oder Update). NULL = noch nie synchronisiert.';
