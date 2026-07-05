-- AAR-183 Phase B: Log fehlgeschlagener Twilio-Sends (failed/undelivered).
-- Die Route src/app/api/webhooks/twilio/status/route.ts insertete hier schon (try/catch),
-- aber die Tabelle wurde nie erstellt -> Insert lief still ins stdout ("Tabelle nicht
-- zwingend"). Jetzt persistiert das Failure-Log (Debug/Dashboard). Additiv, kein Code-Change.
CREATE TABLE IF NOT EXISTS public.twilio_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_sid text NOT NULL,
  status text NOT NULL,
  error_code text,
  to_phone text,
  was_whatsapp boolean NOT NULL DEFAULT false,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_twilio_status_events_created_at ON public.twilio_status_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_twilio_status_events_to_phone ON public.twilio_status_events (to_phone);

ALTER TABLE public.twilio_status_events ENABLE ROW LEVEL SECURITY;

-- Staff darf lesen (Debug/Dashboard); Schreiben nur der StatusCallback via service-role (bypasst RLS).
CREATE POLICY twilio_status_events_staff_read ON public.twilio_status_events
  FOR SELECT USING (public.is_staff());

COMMENT ON TABLE public.twilio_status_events IS
  'AAR-183 Phase B: Log fehlgeschlagener Twilio-Sends (failed/undelivered) fuer Debug/Dashboard. Schreibt /api/webhooks/twilio/status (StatusCallback) via service-role.';
