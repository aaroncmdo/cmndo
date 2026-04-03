-- KFZ-126: Szenario-basierter Fortschritt im Kundenportal
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS szenario TEXT DEFAULT 'normalfall';
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS ruege_erhalten_am TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS ruege_grund TEXT;

-- CHECK Constraint fuer szenario
DO $$ BEGIN
  ALTER TABLE faelle ADD CONSTRAINT faelle_szenario_check
    CHECK (szenario IN ('normalfall', 'ruegefall', 'klagefall'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
