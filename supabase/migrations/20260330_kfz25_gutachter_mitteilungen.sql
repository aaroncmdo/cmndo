-- KFZ-25: Gutachter-Mitteilungszentrale
CREATE TABLE IF NOT EXISTS gutachter_mitteilungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sv_id UUID REFERENCES sachverstaendige(id) ON DELETE CASCADE,
  fall_id UUID REFERENCES faelle(id) ON DELETE SET NULL,
  typ TEXT NOT NULL CHECK (typ IN (
    'neuer_auftrag',
    'termin_bestaetigt',
    'termin_geaendert',
    'kunde_dokument_hochgeladen',
    'kunde_chat_nachricht',
    'vorschaden_warnung',
    'gutachten_erinnerung',
    'qc_bestanden',
    'qc_nachbesserung',
    'kanzlei_as_gesendet',
    'kanzlei_regulierung',
    'kanzlei_zahlung',
    'paket_fast_voll',
    'guthaben_niedrig'
  )),
  titel TEXT NOT NULL,
  nachricht TEXT NOT NULL,
  gelesen BOOLEAN DEFAULT false,
  dringend BOOLEAN DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gm_sv_id ON gutachter_mitteilungen(sv_id);
CREATE INDEX IF NOT EXISTS idx_gm_gelesen ON gutachter_mitteilungen(sv_id, gelesen) WHERE gelesen = false;

-- RLS
ALTER TABLE gutachter_mitteilungen ENABLE ROW LEVEL SECURITY;

-- Gutachter kann nur eigene Mitteilungen sehen
CREATE POLICY "gutachter_mitteilungen_select" ON gutachter_mitteilungen
  FOR SELECT USING (
    sv_id IN (SELECT id FROM sachverstaendige WHERE profile_id = auth.uid())
  );

-- Gutachter kann eigene Mitteilungen als gelesen markieren
CREATE POLICY "gutachter_mitteilungen_update" ON gutachter_mitteilungen
  FOR UPDATE USING (
    sv_id IN (SELECT id FROM sachverstaendige WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    sv_id IN (SELECT id FROM sachverstaendige WHERE profile_id = auth.uid())
  );

-- Admin/System kann Mitteilungen erstellen (service role bypasses RLS)
-- Normale Inserts kommen via service-role Admin-Client
