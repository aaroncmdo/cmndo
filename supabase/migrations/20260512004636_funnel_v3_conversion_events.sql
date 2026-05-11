-- 2026-05-12 Funnel v3 Backlog: Conversion-Tracking fuer Self-Dispatch-Funnel.
-- Schreibt pro Phase + Submit + Konvertierung einen Event. Cron aggregiert
-- spaeter zu Drop-off-Statistiken.
--
-- Felder bewusst minimal — nur was wir fuer Funnel-Analyse brauchen.
-- KEINE PII (kein Name, kein Email, kein Telefon) — anonyme Funnel-Daten.

CREATE TABLE IF NOT EXISTS public.conversion_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Welcher Funnel (gutachter-finden, kunde-onboarding, sv-onboarding-basic)
  flow_key TEXT NOT NULL,
  -- Welche Phase (standort, termin, service, kanzlei, kontakt, submit, konvertiert)
  phase_key TEXT NOT NULL,
  -- Event-Typ: 'phase_started' | 'phase_completed' | 'submit_started' | 'konvertiert' | 'drop_off'
  event_type TEXT NOT NULL,
  -- Optional: ID der gufa-Anfrage (kommt nach Phase 1)
  anfrage_id UUID,
  -- Optional: Service-Typ + Kanzlei-Wahl (fuer Conversion-Analyse Komplett vs nur)
  service_typ TEXT,
  kanzlei_wunsch TEXT,
  -- Anonymes Session-Tracking — gleicher User in mehreren Phasen
  session_id TEXT,
  -- Diagnostik
  user_agent TEXT,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversion_events_flow_phase
  ON public.conversion_events(flow_key, phase_key, ts DESC);

CREATE INDEX IF NOT EXISTS idx_conversion_events_session
  ON public.conversion_events(session_id, ts);

CREATE INDEX IF NOT EXISTS idx_conversion_events_anfrage
  ON public.conversion_events(anfrage_id)
  WHERE anfrage_id IS NOT NULL;

COMMENT ON TABLE public.conversion_events IS
  '2026-05-12 Funnel v3: Drop-off-Tracking fuer Self-Dispatch-Funnel. Anonym, ohne PII.';
