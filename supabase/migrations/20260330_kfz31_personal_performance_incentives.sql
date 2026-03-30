-- KFZ-31: Personal-Tab Performance + Leaderboard + Incentives

-- Profile-Spalten (idempotent)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gehaltsstufe TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gehalt_brutto DECIMAL(10,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS eingestellt_am DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kategorie TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kapazitaet_max INTEGER DEFAULT 100;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS aktiv BOOLEAN DEFAULT true;

-- Mitarbeiter Performance
CREATE TABLE IF NOT EXISTS mitarbeiter_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mitarbeiter_id UUID REFERENCES profiles(id),
  monat TEXT NOT NULL,
  jahr INTEGER NOT NULL,
  leads_qualifiziert INTEGER DEFAULT 0,
  leads_konvertiert INTEGER DEFAULT 0,
  faelle_abgeschlossen INTEGER DEFAULT 0,
  aktive_faelle INTEGER DEFAULT 0,
  durchschnittliche_bearbeitungszeit_tage DECIMAL(5,1),
  kundenzufriedenheit DECIMAL(3,1),
  umsatz_generiert DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mitarbeiter_id, monat, jahr)
);

ALTER TABLE mitarbeiter_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mitarbeiter_performance_admin" ON mitarbeiter_performance FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle = 'admin')
);
CREATE POLICY "mitarbeiter_performance_own" ON mitarbeiter_performance FOR SELECT USING (
  mitarbeiter_id = auth.uid()
);

-- Incentives
CREATE TABLE IF NOT EXISTS incentives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titel TEXT NOT NULL,
  beschreibung TEXT,
  kategorie TEXT CHECK (kategorie IN ('dispatch','kundenbetreuer','alle')),
  typ TEXT CHECK (typ IN ('bonus','provision','sachleistung','freizeit')),
  bedingung TEXT NOT NULL,
  wert DECIMAL(10,2),
  aktiv BOOLEAN DEFAULT true,
  gueltig_ab DATE,
  gueltig_bis DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE incentives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incentives_admin" ON incentives FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle = 'admin')
);
CREATE POLICY "incentives_read" ON incentives FOR SELECT USING (true);

-- Incentive Auszahlungen
CREATE TABLE IF NOT EXISTS incentive_auszahlungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incentive_id UUID REFERENCES incentives(id),
  mitarbeiter_id UUID REFERENCES profiles(id),
  monat TEXT,
  betrag DECIMAL(10,2),
  status TEXT DEFAULT 'offen' CHECK (status IN ('offen','genehmigt','ausgezahlt')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE incentive_auszahlungen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incentive_auszahlungen_admin" ON incentive_auszahlungen FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle = 'admin')
);
CREATE POLICY "incentive_auszahlungen_own" ON incentive_auszahlungen FOR SELECT USING (
  mitarbeiter_id = auth.uid()
);
