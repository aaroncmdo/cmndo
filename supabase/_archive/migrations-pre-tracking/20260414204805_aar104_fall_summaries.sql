CREATE TABLE IF NOT EXISTS fall_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id UUID NOT NULL REFERENCES faelle(id) ON DELETE CASCADE,
  kunden_anliegen TEXT,
  zusammenfassung TEXT NOT NULL,
  empfohlene_naechste_schritte TEXT,
  ai_modell TEXT NOT NULL DEFAULT 'claude-sonnet-4-5',
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  generated_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  fall_status_at_generation TEXT,
  anzahl_dokumente_at_generation INTEGER,
  anzahl_nachrichten_at_generation INTEGER,
  letzte_timeline_event_at_generation TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fall_summaries_fall_id ON fall_summaries(fall_id, generated_at DESC);

ALTER TABLE fall_summaries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fall_summaries_staff' AND tablename = 'fall_summaries') THEN
    CREATE POLICY "fall_summaries_staff" ON fall_summaries FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rolle IN ('admin','kundenbetreuer','leadbearbeiter','dispatch'))
    );
  END IF;
END $$;;
