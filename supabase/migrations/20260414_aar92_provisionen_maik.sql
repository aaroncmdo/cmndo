-- AAR-92: Provisionen-Tracking fuer Maik (Google Ads Partner)
CREATE TABLE IF NOT EXISTS provisionen_maik (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  monat TEXT NOT NULL,
  basis_provision NUMERIC(10,2) NOT NULL DEFAULT 150.00,
  cpl_actual NUMERIC(10,2),
  netto_provision NUMERIC(10,2) GENERATED ALWAYS AS (basis_provision - COALESCE(cpl_actual, 0)) STORED,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','paid','reversed')),
  source_channel TEXT,
  reversed_grund TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_provisionen_maik_monat ON provisionen_maik(monat);
CREATE INDEX IF NOT EXISTS idx_provisionen_maik_status ON provisionen_maik(status);
CREATE INDEX IF NOT EXISTS idx_provisionen_maik_lead ON provisionen_maik(lead_id);

ALTER TABLE provisionen_maik ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Mitarbeiter provisionen_maik' AND tablename = 'provisionen_maik') THEN
    CREATE POLICY "Mitarbeiter provisionen_maik" ON provisionen_maik
      FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rolle IN ('admin','kundenbetreuer','leadbearbeiter','dispatch'))
      );
  END IF;
END $$;
