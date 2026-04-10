-- KFZ-182: KB-eigene Rufnummer + Gesamt-Chat-Inbox + Update-Badges

-- ─── 1. Twilio-Nummer pro Kundenbetreuer ──────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS twilio_whatsapp_nummer TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS twilio_phone_sid TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS twilio_nummer_provisioned_am TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_twilio_nummer
  ON profiles(twilio_whatsapp_nummer)
  WHERE twilio_whatsapp_nummer IS NOT NULL;

-- ─── 2. fall_read_state (per-User per-Fall Read-Tracking) ─────────────────────

CREATE TABLE IF NOT EXISTS fall_read_state (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fall_id UUID NOT NULL REFERENCES faelle(id) ON DELETE CASCADE,
  last_read_chat_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01',
  last_read_update_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, fall_id)
);

CREATE INDEX IF NOT EXISTS idx_fall_read_state_user
  ON fall_read_state(user_id, fall_id);

-- RLS
ALTER TABLE fall_read_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service-Role bypass fall_read_state"
  ON fall_read_state FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users can manage own read state"
  ON fall_read_state FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── 3. Nachrichten: kb_empfaenger_id + external_id Spalten ───────────────────

ALTER TABLE nachrichten ADD COLUMN IF NOT EXISTS kb_empfaenger_id UUID REFERENCES auth.users(id);
ALTER TABLE nachrichten ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE nachrichten ADD COLUMN IF NOT EXISTS richtung TEXT DEFAULT 'outbound';

-- ─── 4. count_unread_updates RPC ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION count_unread_updates(p_fall_id UUID, p_since TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (SELECT count(*)::int FROM tasks
     WHERE fall_id = p_fall_id AND created_at > p_since) +
    (SELECT count(*)::int FROM timeline
     WHERE fall_id = p_fall_id AND created_at > p_since AND typ IN ('system', 'status', 'dokument')) +
    (SELECT count(*)::int FROM fall_dokumente
     WHERE fall_id = p_fall_id AND hochgeladen_am > p_since AND geloescht_am IS NULL),
  0);
$$;
