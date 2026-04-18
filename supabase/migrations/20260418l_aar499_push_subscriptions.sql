-- AAR-499 N4: Web-Push Subscriptions pro User. Jeder Browser/Gerät registriert
-- sich einmalig mit endpoint+p256dh+auth. Worker-channel web-push liest alle
-- aktiven Subs (expired_at IS NULL) und sendet pro Sub. 410-Gone-Responses
-- werden als expired markiert.

BEGIN;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  platform TEXT NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_sub_user
  ON push_subscriptions(user_id) WHERE expired_at IS NULL;

COMMENT ON TABLE push_subscriptions IS
  'AAR-499 N4: Web-Push-Subscriptions. Jeder Browser/Gerät = eigene Row. platform=web|native (native für Capacitor). expired_at gesetzt wenn Push-Service 410 Gone liefert.';

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_sub_self" ON push_subscriptions;
CREATE POLICY "push_sub_self" ON push_subscriptions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMIT;
