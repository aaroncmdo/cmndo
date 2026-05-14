ALTER TABLE sachverstaendige
  ADD COLUMN IF NOT EXISTS sa_vorlage_status TEXT,
  ADD COLUMN IF NOT EXISTS sa_vorlage_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS sa_vorlage_hochgeladen_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sa_vorlage_geprueft_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sa_vorlage_geprueft_von_user_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS sa_vorlage_admin_notiz TEXT,
  ADD COLUMN IF NOT EXISTS verifizierung_status TEXT,
  ADD COLUMN IF NOT EXISTS verifizierung_frist_bis TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verifiziert_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verifiziert_von_user_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS verifizierung_admin_notiz TEXT,
  ADD COLUMN IF NOT EXISTS gesperrt_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gesperrt_grund TEXT,
  ADD COLUMN IF NOT EXISTS gesperrt_von_user_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS dat_nummer TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sachverstaendige_sa_vorlage_status_check') THEN
    ALTER TABLE sachverstaendige ADD CONSTRAINT sachverstaendige_sa_vorlage_status_check
      CHECK (sa_vorlage_status IS NULL OR sa_vorlage_status IN ('ausstehend','geprueft','zurueckgewiesen'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sachverstaendige_verifizierung_status_check') THEN
    ALTER TABLE sachverstaendige ADD CONSTRAINT sachverstaendige_verifizierung_status_check
      CHECK (verifizierung_status IS NULL OR verifizierung_status IN ('ausstehend','geprueft','frist_ueberschritten'));
  END IF;
END $$;

ALTER TABLE pflichtdokumente
  ADD COLUMN IF NOT EXISTS gutachter_id UUID REFERENCES sachverstaendige(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pflichtdokumente_fall_or_gutachter_required') THEN
    ALTER TABLE pflichtdokumente ADD CONSTRAINT pflichtdokumente_fall_or_gutachter_required
      CHECK (fall_id IS NOT NULL OR gutachter_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pflichtdokumente_gutachter
  ON pflichtdokumente(gutachter_id) WHERE gutachter_id IS NOT NULL;;
