ALTER TABLE termine
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS event_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_sync_status TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_termine_google_event ON termine(google_event_id) WHERE google_event_id IS NOT NULL;;
