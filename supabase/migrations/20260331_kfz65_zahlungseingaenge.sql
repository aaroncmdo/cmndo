-- KFZ-65: Zahlungseingaenge + Positionen (bereits via SQL Editor erstellt)
CREATE TABLE IF NOT EXISTS zahlungseingaenge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id UUID NOT NULL REFERENCES faelle(id) ON DELETE CASCADE,
  zahlungsdatum DATE NOT NULL,
  gesamtbetrag DECIMAL(10,2) NOT NULL,
  referenz TEXT,
  erfasst_von UUID,
  erstellt_am TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS zahlungspositionen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zahlung_id UUID NOT NULL REFERENCES zahlungseingaenge(id) ON DELETE CASCADE,
  fall_id UUID NOT NULL REFERENCES faelle(id) ON DELETE CASCADE,
  position TEXT NOT NULL,
  gefordert DECIMAL(10,2) NOT NULL DEFAULT 0,
  gezahlt DECIMAL(10,2) DEFAULT 0,
  notiz TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE zahlungseingaenge ENABLE ROW LEVEL SECURITY;
ALTER TABLE zahlungspositionen ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admin zahlungseingaenge" ON zahlungseingaenge FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin', 'kundenbetreuer')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admin zahlungspositionen" ON zahlungspositionen FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin', 'kundenbetreuer')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
