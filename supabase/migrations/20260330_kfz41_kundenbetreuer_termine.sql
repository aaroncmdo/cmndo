-- KFZ-41: Kundenbetreuer-Termine mit Kunden
CREATE TABLE IF NOT EXISTS termine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id UUID REFERENCES faelle(id) ON DELETE CASCADE,
  kunde_user_id UUID,
  betreuer_user_id UUID,
  typ TEXT NOT NULL CHECK (typ IN ('telefonat', 'video-call')),
  datum TIMESTAMPTZ NOT NULL,
  dauer_minuten INTEGER DEFAULT 30,
  betreff TEXT,
  notiz TEXT,
  meet_link TEXT,
  status TEXT DEFAULT 'geplant' CHECK (status IN ('geplant', 'bestaetigt', 'durchgefuehrt', 'abgesagt', 'nicht-erschienen')),
  ergebnis_notiz TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_termine_fall_id ON termine(fall_id);
CREATE INDEX IF NOT EXISTS idx_termine_betreuer ON termine(betreuer_user_id);
CREATE INDEX IF NOT EXISTS idx_termine_kunde ON termine(kunde_user_id);
CREATE INDEX IF NOT EXISTS idx_termine_datum ON termine(datum);

-- RLS
ALTER TABLE termine ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin sieht alle Termine" ON termine FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin', 'superadmin'))
  );

CREATE POLICY "Kundenbetreuer sieht eigene Termine" ON termine FOR ALL
  USING (betreuer_user_id = auth.uid());

CREATE POLICY "Kunde sieht eigene Termine" ON termine FOR SELECT
  USING (kunde_user_id = auth.uid());
