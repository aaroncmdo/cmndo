-- AAR-229 W2: Zentrale mitteilungen-Tabelle. Additiv — alte
-- gutachter_mitteilungen + benachrichtigungen bleiben unverändert.
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
