-- KFZ-152 Phase 2+3: Akademie + Community Erweiterungen
-- 1. Akademie-Erst-Anzahlung als individueller Betrag pro Akademie + Radius
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS akademie_erst_anzahlung_eur NUMERIC(10,2) NULL;
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS akademie_radius_km INT NULL;

-- 2. vertragsvorlagen.typ-Constraint erweitern um die 2 neuen Vertragstypen
ALTER TABLE vertragsvorlagen DROP CONSTRAINT IF EXISTS vertragsvorlagen_typ_check;
ALTER TABLE vertragsvorlagen ADD CONSTRAINT vertragsvorlagen_typ_check CHECK (
  typ IN ('nutzungsbedingungen', 'kooperationsvertrag_muster', 'sa_kunde', 'akademie_kooperation', 'community_kooperation')
);

-- 3. Stub-Vertragsvorlage 'akademie_kooperation' (Aaron fuellt spaeter via Editor)
INSERT INTO vertragsvorlagen (typ, titel, version, inhalt_html, pflicht_unterschrift, aktiv)
VALUES (
  'akademie_kooperation',
  'Akademie-Kooperationsvertrag',
  'v1',
  '<h2>Akademie-Kooperationsvertrag</h2><p>Die Akademie verpflichtet sich, die monatlichen Anzahlungen ihrer Sub-SVs einzusammeln und gebuendelt an Claimondo zu zahlen. Vollstaendiger Vertragstext folgt via Vertrags-Editor.</p>',
  true,
  true
)
ON CONFLICT DO NOTHING;

-- 4. faelle.organisation_id fuer Org-Routing (Akademie/Community Pool)
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS organisation_id UUID NULL REFERENCES organisationen(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_faelle_organisation_id ON faelle(organisation_id) WHERE organisation_id IS NOT NULL;
