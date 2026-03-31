-- KFZ-94: Individuelle Anfragen für Gutachter-Pakete
CREATE TABLE IF NOT EXISTS individuelle_anfragen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sv_id UUID NOT NULL REFERENCES sachverstaendige(id),
  gewuenschte_faelle INTEGER,
  gewuenschter_radius_km INTEGER,
  nachricht TEXT,
  status TEXT DEFAULT 'neu' CHECK (status IN ('neu', 'in-bearbeitung', 'angeboten', 'angenommen', 'abgelehnt')),
  erstellt_am TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE individuelle_anfragen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sv_eigene_anfragen_lesen" ON individuelle_anfragen
  FOR SELECT USING (
    sv_id IN (SELECT id FROM sachverstaendige WHERE profile_id = auth.uid() OR user_id = auth.uid())
  );

CREATE POLICY "sv_eigene_anfragen_erstellen" ON individuelle_anfragen
  FOR INSERT WITH CHECK (
    sv_id IN (SELECT id FROM sachverstaendige WHERE profile_id = auth.uid() OR user_id = auth.uid())
  );

CREATE POLICY "admin_alle_anfragen" ON individuelle_anfragen
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin', 'kundenbetreuer'))
  );
