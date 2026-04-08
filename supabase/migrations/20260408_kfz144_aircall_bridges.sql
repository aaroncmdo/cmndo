-- KFZ-144: Aircall Bridge-Calls via Relay-Seats

CREATE TABLE IF NOT EXISTS aircall_relay_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircall_user_id BIGINT UNIQUE NOT NULL,
  aircall_user_email TEXT NOT NULL,
  aircall_number_id BIGINT NOT NULL,
  bezeichnung TEXT NOT NULL,
  aktiv BOOLEAN NOT NULL DEFAULT true,
  zuletzt_verwendet TIMESTAMPTZ NULL,
  belegt BOOLEAN NOT NULL DEFAULT false,
  belegt_seit TIMESTAMPTZ NULL,
  belegt_call_id UUID NULL REFERENCES calls(id),
  notiz TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relay_seats_belegt ON aircall_relay_seats(belegt) WHERE aktiv = true;

-- Bridge-JSONB auf calls
ALTER TABLE calls ADD COLUMN IF NOT EXISTS bridge JSONB NULL;
CREATE INDEX IF NOT EXISTS idx_calls_bridge ON calls((bridge->>'typ')) WHERE bridge IS NOT NULL;

-- richtung um 'bridge' erweitern
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_richtung_check;
ALTER TABLE calls ADD CONSTRAINT calls_richtung_check CHECK (richtung IN ('outbound','inbound','bridge'));
