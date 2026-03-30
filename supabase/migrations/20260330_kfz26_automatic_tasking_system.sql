-- KFZ-26: Automatisches Tasking-System
-- Tasks-Tabelle erstellen (falls noch nicht vorhanden)
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id UUID REFERENCES faelle(id) ON DELETE CASCADE,
  typ TEXT NOT NULL,
  titel TEXT NOT NULL,
  beschreibung TEXT,
  status TEXT DEFAULT 'offen' CHECK (status IN ('offen','in-bearbeitung','erledigt','blockiert')),
  faellig_am TIMESTAMPTZ,
  erledigt_am TIMESTAMPTZ,
  zugewiesen_an UUID REFERENCES profiles(id),
  auto_erstellt BOOLEAN DEFAULT false,
  erinnerung_gesendet BOOLEAN DEFAULT false,
  prioritaet TEXT DEFAULT 'normal' CHECK (prioritaet IN ('normal','dringend','kritisch')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Neue Spalten hinzufuegen falls Tabelle schon existiert aber Spalten fehlen
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_erstellt BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS erinnerung_gesendet BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS prioritaet TEXT DEFAULT 'normal' CHECK (prioritaet IN ('normal','dringend','kritisch'));

-- Indexes fuer Performance
CREATE INDEX IF NOT EXISTS idx_tasks_fall_id ON tasks(fall_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_zugewiesen_an ON tasks(zugewiesen_an);
CREATE INDEX IF NOT EXISTS idx_tasks_faellig_am ON tasks(faellig_am);

-- RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Admin und Kundenbetreuer: voller Zugriff
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins full access on tasks' AND tablename = 'tasks') THEN
    CREATE POLICY "Admins full access on tasks"
      ON tasks FOR ALL
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rolle IN ('admin', 'kundenbetreuer'))
      );
  END IF;
END $$;

-- Gutachter: eigene Tasks lesen und aktualisieren
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Gutachter own tasks' AND tablename = 'tasks') THEN
    CREATE POLICY "Gutachter own tasks"
      ON tasks FOR ALL
      USING (zugewiesen_an = auth.uid());
  END IF;
END $$;
