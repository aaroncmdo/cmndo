-- AAR-698: admin_termine Google-Calendar-Event-Felder.
ALTER TABLE public.admin_termine
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS google_event_synced_at timestamp with time zone;

COMMENT ON COLUMN public.admin_termine.google_event_id IS 'AAR-698: Google-Calendar-Event-ID im Kalender des zugewiesen_an-Users.';
COMMENT ON COLUMN public.admin_termine.google_calendar_id IS 'AAR-698: Calendar-ID (meist primary).';
COMMENT ON COLUMN public.admin_termine.google_event_synced_at IS 'AAR-698: Zeitstempel des letzten erfolgreichen Sync.';
