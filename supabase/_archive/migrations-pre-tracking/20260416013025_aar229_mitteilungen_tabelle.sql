CREATE TABLE IF NOT EXISTS mitteilungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empfaenger_id UUID NOT NULL REFERENCES profiles(id),
  empfaenger_rolle TEXT NOT NULL,
  kategorie TEXT NOT NULL CHECK (kategorie IN ('update', 'task', 'nachricht', 'anruf')),
  titel TEXT NOT NULL,
  inhalt TEXT,
  kontext_typ TEXT,
  kontext_id UUID,
  route_url TEXT,
  gelesen BOOLEAN NOT NULL DEFAULT false,
  gelesen_am TIMESTAMPTZ,
  absender_id UUID REFERENCES profiles(id),
  absender_name TEXT,
  icon TEXT,
  prioritaet TEXT DEFAULT 'normal' CHECK (prioritaet IN ('normal', 'hoch', 'dringend')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mitteilungen_empfaenger ON mitteilungen(empfaenger_id, gelesen, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mitteilungen_kategorie ON mitteilungen(empfaenger_id, kategorie, gelesen);

ALTER TABLE mitteilungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='mitteilungen_select' AND tablename='mitteilungen') THEN
    CREATE POLICY "mitteilungen_select" ON mitteilungen FOR SELECT USING (empfaenger_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='mitteilungen_update' AND tablename='mitteilungen') THEN
    CREATE POLICY "mitteilungen_update" ON mitteilungen FOR UPDATE USING (empfaenger_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='mitteilungen_insert' AND tablename='mitteilungen') THEN
    CREATE POLICY "mitteilungen_insert" ON mitteilungen FOR INSERT WITH CHECK (true);
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE mitteilungen;;
