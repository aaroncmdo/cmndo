-- KFZ-172: Fall-Dokumente mit Phase x Szenario Pflichtdokumente-Logik
-- + aktuelle_phase Spalte auf faelle + dokumente_vollstaendig Tracking

-- 1. faelle erweitern
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS aktuelle_phase TEXT;

-- KFZ-172/173: szenario CHECK constraint erweitern fuer die 6 neuen Szenarien
ALTER TABLE faelle DROP CONSTRAINT IF EXISTS faelle_szenario_check;
ALTER TABLE faelle ADD CONSTRAINT faelle_szenario_check CHECK (
  szenario IS NULL OR szenario IN (
    'normalfall', 'ruegefall', 'klagefall',
    'haftpflicht_eindeutig', 'haftpflicht_strittig', 'bewertung',
    'leasingrueckgabe', 'totalschaden', 'gerichtsgutachten'
  )
);
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS dokumente_vollstaendig_fuer_phase TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS dokumente_vollstaendig_am_phase TIMESTAMPTZ;

-- 2. fall_dokumente Tabelle
CREATE TABLE IF NOT EXISTS fall_dokumente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id UUID NOT NULL REFERENCES faelle(id) ON DELETE CASCADE,
  dokument_typ TEXT NOT NULL,
  ist_pflicht BOOLEAN NOT NULL DEFAULT false,
  ab_phase TEXT,
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  groesse_bytes INT,
  ocr_status TEXT DEFAULT 'pending' CHECK (ocr_status IN ('pending','processing','done','failed','skipped')),
  ocr_extracted_data JSONB,
  ocr_processed_at TIMESTAMPTZ,
  hochgeladen_von_user_id UUID,
  hochgeladen_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  geloescht_am TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fall_dokumente_fall ON fall_dokumente(fall_id) WHERE geloescht_am IS NULL;
CREATE INDEX IF NOT EXISTS idx_fall_dokumente_pflicht ON fall_dokumente(fall_id, ist_pflicht) WHERE geloescht_am IS NULL;

-- 3. RLS
ALTER TABLE fall_dokumente ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access fall_dokumente') THEN
    CREATE POLICY "Admin full access fall_dokumente"
      ON fall_dokumente FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin', 'kundenbetreuer')));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'SV eigene Fall-Dokumente') THEN
    CREATE POLICY "SV eigene Fall-Dokumente"
      ON fall_dokumente FOR ALL
      USING (
        fall_id IN (
          SELECT id FROM faelle WHERE sv_id IN (
            SELECT id FROM sachverstaendige WHERE profile_id = auth.uid()
          )
        )
      );
  END IF;
END $$;
