-- KFZ-184: 2FA per SMS + Remember-Me Tokens
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS twofa_aktiviert BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS twofa_telefon TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS twofa_telefon_verifiziert_am TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS auth_remember_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  device_name TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_am TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_remember_tokens_user ON auth_remember_tokens(user_id) WHERE revoked_am IS NULL;
CREATE INDEX IF NOT EXISTS idx_remember_tokens_hash ON auth_remember_tokens(token_hash) WHERE revoked_am IS NULL;
ALTER TABLE auth_remember_tokens ENABLE ROW LEVEL SECURITY;
