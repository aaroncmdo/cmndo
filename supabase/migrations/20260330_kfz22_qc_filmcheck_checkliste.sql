CREATE TABLE IF NOT EXISTS qc_checkliste (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id UUID REFERENCES faelle(id) ON DELETE CASCADE,
  gutachten_vorhanden BOOLEAN DEFAULT false,
  gutachten_vollstaendig BOOLEAN DEFAULT false,
  fin_17_zeichen BOOLEAN DEFAULT false,
  schadenspositionen_erfasst BOOLEAN DEFAULT false,
  fotos_ausreichend BOOLEAN DEFAULT false,
  sa_vorhanden BOOLEAN DEFAULT false,
  vollmacht_vorhanden BOOLEAN DEFAULT false,
  kundendaten_vollstaendig BOOLEAN DEFAULT false,
  vorschaeden_beruecksichtigt BOOLEAN,
  kommentar TEXT,
  geprueft_von UUID REFERENCES profiles(id),
  geprueft_am TIMESTAMPTZ,
  status TEXT DEFAULT 'offen' CHECK (status IN ('offen','bestanden','nachbesserung')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fall_id)
);

ALTER TABLE qc_checkliste ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on qc_checkliste"
  ON qc_checkliste FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rolle IN ('admin', 'kundenbetreuer'))
  );

CREATE POLICY "Gutachter read own qc_checkliste"
  ON qc_checkliste FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM faelle f
      JOIN sachverstaendige sv ON sv.id = f.sv_id
      WHERE f.id = qc_checkliste.fall_id
        AND sv.profile_id = auth.uid()
    )
  );
