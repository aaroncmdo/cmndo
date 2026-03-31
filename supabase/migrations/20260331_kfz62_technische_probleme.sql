-- KFZ-62: Technische Probleme Tabelle (bereits via SQL Editor erstellt)
CREATE TABLE IF NOT EXISTS technische_probleme (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  fall_id UUID REFERENCES faelle(id),
  kategorie TEXT NOT NULL,
  beschreibung TEXT NOT NULL,
  screenshot_url TEXT,
  browser TEXT,
  aktuelle_url TEXT,
  status TEXT DEFAULT 'neu' CHECK (status IN ('neu', 'in-bearbeitung', 'geloest', 'geschlossen')),
  antwort TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE technische_probleme ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Kunde eigene Probleme" ON technische_probleme FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Admin alle Probleme" ON technische_probleme FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
