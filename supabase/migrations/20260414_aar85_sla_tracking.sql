-- AAR-85: SLA-Tracking fuer SA-Unterschrift Trigger-Pipeline
-- 4 SLA-Typen mit Frist-Berechnung beim Insert.

CREATE TABLE IF NOT EXISTS sla_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id UUID NOT NULL REFERENCES faelle(id) ON DELETE CASCADE,
  sla_typ TEXT NOT NULL CHECK (sla_typ IN (
    'gutachter_zuweisung',   -- 30 Min
    'termin_bestaetigung',   -- 60 Min
    'besichtigung',          -- 48 Std
    'gutachten_upload'       -- 24 Std nach Besichtigung
  )),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  breach_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed','breached')),
  eskalation_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (fall_id, sla_typ)
);

CREATE INDEX IF NOT EXISTS idx_sla_tracking_fall_id ON sla_tracking(fall_id);
CREATE INDEX IF NOT EXISTS idx_sla_tracking_status ON sla_tracking(status);
CREATE INDEX IF NOT EXISTS idx_sla_tracking_breach_at ON sla_tracking(breach_at)
  WHERE status = 'pending';

ALTER TABLE sla_tracking ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins read sla_tracking' AND tablename = 'sla_tracking') THEN
    CREATE POLICY "Admins read sla_tracking"
      ON sla_tracking FOR SELECT
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rolle IN ('admin','kundenbetreuer','dispatch'))
      );
  END IF;
END $$;
