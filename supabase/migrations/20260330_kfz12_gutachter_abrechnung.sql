-- KFZ-12: Gutachter-Abrechnung + Guthaben-System

-- Abrechnungstabelle: Jede einzelne Fallabrechnung
CREATE TABLE IF NOT EXISTS gutachter_abrechnungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sv_id UUID REFERENCES sachverstaendige(id),
  fall_id UUID REFERENCES faelle(id),
  schadenhoehe DECIMAL(10,2),
  leadpreis DECIMAL(10,2),
  preistyp TEXT CHECK (preistyp IN ('paket','einzel')),
  guthaben_vorher DECIMAL(10,2),
  guthaben_nachher DECIMAL(10,2),
  monat TEXT,
  abgerechnet_am TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Einzahlungstabelle: Anzahlungen, Nachzahlungen, Paketwechsel
CREATE TABLE IF NOT EXISTS gutachter_einzahlungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sv_id UUID REFERENCES sachverstaendige(id),
  betrag DECIMAL(10,2) NOT NULL,
  typ TEXT CHECK (typ IN ('anzahlung','nachzahlung','paketwechsel')),
  beschreibung TEXT,
  eingezahlt_am TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE gutachter_abrechnungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE gutachter_einzahlungen ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "admin_abrechnungen_all" ON gutachter_abrechnungen
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','kanzlei'))
  );

CREATE POLICY "admin_einzahlungen_all" ON gutachter_einzahlungen
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','kanzlei'))
  );

-- Gutachter can read own records
CREATE POLICY "sv_abrechnungen_read" ON gutachter_abrechnungen
  FOR SELECT USING (
    sv_id IN (SELECT id FROM sachverstaendige WHERE profile_id = auth.uid())
  );

CREATE POLICY "sv_einzahlungen_read" ON gutachter_einzahlungen
  FOR SELECT USING (
    sv_id IN (SELECT id FROM sachverstaendige WHERE profile_id = auth.uid())
  );
