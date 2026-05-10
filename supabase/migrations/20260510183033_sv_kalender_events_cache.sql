-- Live-Termine: Cache-Tabelle für externe Kalender-Events (Google + CalDAV).
--
-- Cron sync-external-calendars (alle 5 Min) schreibt hierher.
-- Page gutachter/kalender liest aus dieser Tabelle statt Live-API-Call.
-- Supabase Realtime auf dieser Tabelle → KalenderRealtimeRefresh triggert
-- router.refresh() wenn neue Events eintreffen (kein manueller Reload).

CREATE TABLE IF NOT EXISTS public.sv_kalender_events_cache (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sv_id            UUID        NOT NULL REFERENCES public.sachverstaendige(id) ON DELETE CASCADE,
  source           TEXT        NOT NULL CHECK (source IN ('google', 'caldav')),
  external_event_id TEXT,
  start_zeit       TIMESTAMPTZ NOT NULL,
  end_zeit         TIMESTAMPTZ NOT NULL,
  titel            TEXT,
  last_synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (sv_id, source, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_sv_kalender_events_sv_zeit
  ON public.sv_kalender_events_cache (sv_id, start_zeit);

ALTER TABLE public.sv_kalender_events_cache ENABLE ROW LEVEL SECURITY;

-- SV darf eigene Cache-Events lesen
CREATE POLICY "sv_liest_eigene_cache_events"
  ON public.sv_kalender_events_cache FOR SELECT
  USING (
    sv_id IN (
      SELECT id FROM public.sachverstaendige WHERE profile_id = auth.uid()
    )
  );

-- Realtime: SV-Kalender-View abonniert INSERT/UPDATE/DELETE auf eigene Rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sv_kalender_events_cache'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sv_kalender_events_cache';
  END IF;
END $$;

ALTER TABLE public.sv_kalender_events_cache REPLICA IDENTITY FULL;

COMMENT ON TABLE public.sv_kalender_events_cache IS
  'Cache für externe Kalender-Events (Google FreeBusy + CalDAV). Cron sync-external-calendars schreibt alle 5 Min.';