-- KFZ-193: KB-Beratungstermin
-- Applied via Supabase MCP on 2026-04-11

ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS typ TEXT NOT NULL DEFAULT 'sv_begutachtung'
  CHECK (typ IN ('sv_begutachtung', 'kb_beratung'));
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS kanal TEXT CHECK (kanal IN ('telefon', 'video'));
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS video_link TEXT;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS kb_id UUID REFERENCES profiles(id);
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS notiz_kunde TEXT;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS notiz_intern TEXT;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS reminder_1h_sent_at TIMESTAMPTZ;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS working_hours JSONB
  DEFAULT '{"mo":["09:00","17:00"],"di":["09:00","17:00"],"mi":["09:00","17:00"],"do":["09:00","17:00"],"fr":["09:00","17:00"]}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_termine_kb_beratung ON gutachter_termine(kb_id, typ, status) WHERE typ = 'kb_beratung';
