-- KFZ-151: Master Auto-Resolve System fuer Tasks
-- Tasks bekommen Entity-Verknuepfung damit sie automatisch geschlossen werden koennen
-- sobald die zugehoerige Sache nachweislich erledigt ist.

-- fall_id nullable machen damit Tasks fuer Nicht-Fall-Entities (sv_onboarding,
-- abrechnung, gutachter, ...) ueberhaupt erstellt werden koennen.
ALTER TABLE tasks ALTER COLUMN fall_id DROP NOT NULL;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS entity_type TEXT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS entity_id UUID NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_resolved_am TIMESTAMPTZ NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_resolved_grund TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_entity
  ON tasks(entity_type, entity_id)
  WHERE entity_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_offen_entity
  ON tasks(entity_type, entity_id)
  WHERE status = 'offen' AND entity_type IS NOT NULL;

-- CHECK-Constraint fuer erlaubte entity_type Werte
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tasks_entity_type') THEN
    ALTER TABLE tasks ADD CONSTRAINT chk_tasks_entity_type CHECK (
      entity_type IS NULL OR entity_type IN (
        'fall','lead','abrechnung','reklamation','sv_onboarding','gutachter','kunde','case','termin','gutschrift'
      )
    );
  END IF;
END $$;
