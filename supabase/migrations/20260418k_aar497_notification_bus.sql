-- AAR-497 N2: Foundation für Event-Bus + Delivery-Log.
--
-- 1. notification_events: Append-only Event-Log (fall.created, task.due, ...)
--    Worker verarbeitet status=pending mit FOR UPDATE SKIP LOCKED.
-- 2. notification_deliveries: Fan-out pro Empfänger × Channel.
-- 3. RLS: Admin liest beides. Empfänger liest eigene Deliveries.
--    (Feinere User-Policies kommen in N5 Preferences.)

BEGIN;

CREATE TABLE IF NOT EXISTS notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  fall_id UUID REFERENCES faelle(id) ON DELETE CASCADE,
  triggered_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notif_events_pending
  ON notification_events(status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notif_events_retry
  ON notification_events(status, next_retry_at) WHERE status = 'failed' AND next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notif_events_fall
  ON notification_events(fall_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_role TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','email','web_push','native_push','in_app')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  skip_reason TEXT,
  external_id TEXT,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_deliv_event ON notification_deliveries(event_id);
CREATE INDEX IF NOT EXISTS idx_notif_deliv_recipient
  ON notification_deliveries(recipient_user_id, created_at DESC);

COMMENT ON TABLE notification_events IS
  'AAR-497 N2: Zentrale Event-Tabelle. Jeder Domain-Event (fall.sv_assigned, task.created, etc.) wird hier appended. Worker verarbeitet status=pending mit FOR UPDATE SKIP LOCKED und fan-outed auf notification_deliveries.';
COMMENT ON TABLE notification_deliveries IS
  'AAR-497 N2: Per-Empfänger × Channel Delivery-Log. status=pending → sent/failed/skipped. external_id referenziert Twilio-MessageSID / Web-Push-Endpoint / etc.';
COMMENT ON COLUMN notification_events.next_retry_at IS
  'AAR-497: Zeitpunkt für den nächsten Retry-Versuch bei failed-Events (exp. Backoff: 1min → 5min → 30min → 2h → dead-letter).';

ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

-- MVP-Policies: Admin liest beides direkt. Finale User-Policies kommen in N5.
DROP POLICY IF EXISTS "notif_events_admin_read" ON notification_events;
CREATE POLICY "notif_events_admin_read" ON notification_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.rolle = 'admin'
    )
  );

DROP POLICY IF EXISTS "notif_deliv_admin_read" ON notification_deliveries;
CREATE POLICY "notif_deliv_admin_read" ON notification_deliveries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.rolle = 'admin'
    )
  );

DROP POLICY IF EXISTS "notif_deliv_recipient_own" ON notification_deliveries;
CREATE POLICY "notif_deliv_recipient_own" ON notification_deliveries
  FOR SELECT
  USING (recipient_user_id = auth.uid());

COMMIT;
