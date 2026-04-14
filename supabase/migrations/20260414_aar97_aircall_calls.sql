-- AAR-97: Aircall Inbound + Outbound Call-Tracking
CREATE TABLE IF NOT EXISTS aircall_calls (
  id BIGSERIAL PRIMARY KEY,
  aircall_id TEXT UNIQUE NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL CHECK (status IN ('answered', 'missed', 'voicemail', 'failed')),
  started_at TIMESTAMPTZ NOT NULL,
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration INTEGER,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  aircall_user_id TEXT,
  aircall_user_email TEXT,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  fall_id UUID REFERENCES faelle(id) ON DELETE SET NULL,
  initiated_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  recording_url TEXT,
  voicemail_url TEXT,
  comments TEXT,
  tags TEXT[],
  raw_event JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aircall_calls_lead_id ON aircall_calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_aircall_calls_fall_id ON aircall_calls(fall_id);
CREATE INDEX IF NOT EXISTS idx_aircall_calls_started_at ON aircall_calls(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_aircall_calls_from_number ON aircall_calls(from_number);

ALTER TABLE aircall_calls ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'aircall_calls_staff' AND tablename = 'aircall_calls') THEN
    CREATE POLICY "aircall_calls_staff" ON aircall_calls
      FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rolle IN ('admin','kundenbetreuer','leadbearbeiter','dispatch'))
      );
  END IF;
END $$;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS aircall_user_id TEXT,
  ADD COLUMN IF NOT EXISTS aircall_email TEXT;
