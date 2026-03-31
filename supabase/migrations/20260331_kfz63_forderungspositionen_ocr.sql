-- KFZ-63: Forderungspositionen Tabelle (bereits via SQL Editor erstellt)
CREATE TABLE IF NOT EXISTS forderungspositionen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id UUID NOT NULL REFERENCES faelle(id) ON DELETE CASCADE,
  typ TEXT NOT NULL CHECK (typ IN ('reparatur', 'wertminderung', 'nutzungsausfall', 'mietwagen', 'gutachterkosten', 'abschleppkosten', 'anwaltskosten', 'kostenpauschale', 'schmerzensgeld', 'wbw', 'restwert', 'sonstiges')),
  bezeichnung TEXT NOT NULL,
  betrag_gefordert DECIMAL,
  betrag_reguliert DECIMAL,
  betrag_gekuerzt DECIMAL,
  quelle TEXT CHECK (quelle IN ('anspruchsschreiben', 'ruegeschreiben', 'gutachten', 'manuell')),
  dokument_id UUID,
  erstellt_am TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_forderungspositionen_fall ON forderungspositionen(fall_id);
ALTER TABLE forderungspositionen ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admin full access forderungen" ON forderungspositionen FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin', 'kundenbetreuer', 'kanzlei')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
