-- AAR-500 N5: Per-User Benachrichtigungs-Präferenzen. Quiet-Hours (TIME mit
-- separat gespeicherter Timezone), Channel-Level-Opt-Outs (ganze Kanal-
-- Abschaltung) und Event-Level-Feintuning (pro EventType → Channels). Worker
-- wertet beides aus — skipped Deliveries bleiben in notification_deliveries
-- mit status='skipped' + skip_reason für Audit.

BEGIN;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  channel_opt_outs JSONB NOT NULL DEFAULT '[]'::jsonb,
  event_opt_outs JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notification_preferences IS
  'AAR-500 N5: Per-User Benachrichtigungs-Präferenzen. channel_opt_outs: string[] ("whatsapp","email","web_push","in_app"). event_opt_outs: Record<eventType, channel[]>. urgent-priority-Events umgehen Quiet-Hours.';

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prefs_self" ON notification_preferences;
CREATE POLICY "prefs_self" ON notification_preferences
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMIT;
