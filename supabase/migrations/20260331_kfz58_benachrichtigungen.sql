-- KFZ-58: Benachrichtigungen-Tabelle (bereits via SQL Editor erstellt)
CREATE TABLE IF NOT EXISTS benachrichtigungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  typ TEXT NOT NULL,
  titel TEXT NOT NULL,
  beschreibung TEXT,
  link TEXT,
  gelesen BOOLEAN DEFAULT false,
  erstellt_am TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_benachrichtigungen_user ON benachrichtigungen(user_id);
CREATE INDEX IF NOT EXISTS idx_benachrichtigungen_gelesen ON benachrichtigungen(user_id, gelesen);
ALTER TABLE benachrichtigungen ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "User eigene Benachrichtigungen" ON benachrichtigungen FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
