-- KFZ-121: Interne Termine — Teilnehmer + Ort (Office/Google Meet)
ALTER TABLE termine ADD COLUMN IF NOT EXISTS ort TEXT DEFAULT 'office';
ALTER TABLE termine ADD COLUMN IF NOT EXISTS meeting_link TEXT;
ALTER TABLE termine ADD COLUMN IF NOT EXISTS teilnehmer JSONB DEFAULT '[]';
ALTER TABLE termine ADD COLUMN IF NOT EXISTS agenda TEXT;
ALTER TABLE termine ADD COLUMN IF NOT EXISTS gcal_event_id TEXT;
