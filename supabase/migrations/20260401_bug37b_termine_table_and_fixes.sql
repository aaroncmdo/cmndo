-- BUG-37B: termine Tabelle erstellen + Realtime fuer sachverstaendige
-- termine-Tabelle fuer KB-Termine (nicht gutachter_termine)
CREATE TABLE IF NOT EXISTS termine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id UUID REFERENCES faelle(id) ON DELETE CASCADE,
  kunde_user_id UUID,
  betreuer_user_id UUID,
  typ TEXT NOT NULL DEFAULT 'telefonat',
  datum TIMESTAMPTZ NOT NULL,
  dauer_minuten INT NOT NULL DEFAULT 30,
  betreff TEXT,
  notiz TEXT,
  meet_link TEXT,
  status TEXT NOT NULL DEFAULT 'geplant',
  ergebnis_notiz TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT now()
);

-- RLS fuer termine
ALTER TABLE termine ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "termine_all_auth" ON termine FOR ALL USING (auth.role() = 'authenticated');

-- Realtime fuer sachverstaendige aktivieren (falls noch nicht)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE sachverstaendige;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Realtime fuer termine aktivieren
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE termine;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
