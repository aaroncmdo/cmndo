ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS google_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS google_access_token TEXT,
  ADD COLUMN IF NOT EXISTS google_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_email TEXT,
  ADD COLUMN IF NOT EXISTS google_connected_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_google_connected ON profiles(id) WHERE google_refresh_token IS NOT NULL;;
