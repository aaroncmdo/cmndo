-- AAR-81: Schadentyp + Freitext fuer Dispatch
ALTER TABLE leads ADD COLUMN IF NOT EXISTS schadentyp TEXT
  CHECK (schadentyp IN ('spurwechsel','auffahrunfall','vorfahrtsverletzung','parkplatz','sonstiges'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS schadentyp_freitext TEXT;
