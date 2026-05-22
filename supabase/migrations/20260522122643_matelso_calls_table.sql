-- matelso Call-Tracking: dedizierte Tabelle fuer eingehende Anruf-Events
-- der kfzgutachter Ads-LP. Spiegel von aircall_calls, aber matelso-spezifisch.
-- status hat BEWUSST keinen strikten CHECK (matelso callStatus-Werte weichen
-- von aircall ab; ein Insert mit unbekanntem Status darf nicht 500en).
CREATE TABLE IF NOT EXISTS matelso_calls (
  id                BIGSERIAL PRIMARY KEY,
  external_call_id  TEXT UNIQUE NOT NULL,
  direction         TEXT NOT NULL DEFAULT 'inbound',
  status            TEXT,
  status_raw        TEXT,
  from_number       TEXT,
  to_number         TEXT,
  duration          INTEGER,
  quelle            TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  lead_id           UUID REFERENCES leads(id) ON DELETE SET NULL,
  fall_id           UUID REFERENCES faelle(id) ON DELETE SET NULL,
  raw_payload       JSONB,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matelso_calls_lead_id    ON matelso_calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_matelso_calls_fall_id    ON matelso_calls(fall_id);
CREATE INDEX IF NOT EXISTS idx_matelso_calls_started_at ON matelso_calls(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_matelso_calls_from_num   ON matelso_calls(from_number);

ALTER TABLE matelso_calls ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'matelso_calls_staff' AND tablename = 'matelso_calls') THEN
    CREATE POLICY "matelso_calls_staff" ON matelso_calls
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.rolle IN ('admin','kundenbetreuer','leadbearbeiter','dispatch')
        )
      );
  END IF;
END $$;
