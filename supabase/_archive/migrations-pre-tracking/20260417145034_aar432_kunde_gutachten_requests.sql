CREATE TABLE IF NOT EXISTS kunde_gutachten_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id UUID NOT NULL REFERENCES faelle(id) ON DELETE CASCADE,
  empfaenger_email TEXT NOT NULL,
  magic_link_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kunde_gutachten_requests_fall_created
  ON kunde_gutachten_requests(fall_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kunde_gutachten_requests_token
  ON kunde_gutachten_requests(magic_link_token);

ALTER TABLE kunde_gutachten_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE kunde_gutachten_requests IS
  'AAR-432: Audit + Rate-Limit für Opt-in Gutachten-Weiterleitung an Kunde per Magic-Link.';
COMMENT ON COLUMN kunde_gutachten_requests.magic_link_token IS
  'Unguessable Token (crypto.randomUUID). Expiry 48h.';
COMMENT ON COLUMN kunde_gutachten_requests.accessed_at IS
  'Erstmaliger Abruf — weitere Abrufe sind erlaubt, accessed_at bleibt beim ersten Zeitpunkt.';;
