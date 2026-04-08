-- KFZ-143: Aircall Integration — Calls + Co-Pilot + Utterances

CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircall_call_id TEXT UNIQUE NOT NULL,
  fall_id UUID NULL REFERENCES faelle(id) ON DELETE SET NULL,
  lead_id UUID NULL REFERENCES leads(id) ON DELETE SET NULL,
  initiator_user_id UUID NULL,
  richtung TEXT NOT NULL CHECK (richtung IN ('outbound','inbound')),
  status TEXT NOT NULL CHECK (status IN ('initiiert','klingelt','aktiv','beendet','verpasst','abgebrochen','failed')),
  von_nummer TEXT NULL,
  zu_nummer TEXT NULL,
  gestartet_am TIMESTAMPTZ NULL,
  beantwortet_am TIMESTAMPTZ NULL,
  beendet_am TIMESTAMPTZ NULL,
  dauer_sekunden INTEGER NULL,
  recording_url TEXT NULL,
  transkript JSONB NULL,
  transkript_text TEXT NULL,
  sentiment TEXT NULL,
  ki_zusammenfassung TEXT NULL,
  ki_naechste_schritte TEXT NULL,
  notiz TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calls_fall ON calls(fall_id);
CREATE INDEX IF NOT EXISTS idx_calls_lead ON calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_calls_aircall ON calls(aircall_call_id);

CREATE TABLE IF NOT EXISTS call_copilot_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  zeitpunkt_offset_sek INTEGER NOT NULL DEFAULT 0,
  ausloeser TEXT NOT NULL,
  vorschlag TEXT NOT NULL,
  kategorie TEXT NOT NULL CHECK (kategorie IN ('einwand','fachinfo','closing','smalltalk','warnung')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_call ON call_copilot_suggestions(call_id);

CREATE TABLE IF NOT EXISTS call_transcription_utterances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  aircall_call_id TEXT NOT NULL,
  speaker TEXT NULL,
  text TEXT NOT NULL,
  start_time NUMERIC NULL,
  end_time NUMERIC NULL,
  empfangen_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  verarbeitet BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_utterances_call_time ON call_transcription_utterances(call_id, empfangen_am);

-- Audio-Settings fuer Browser-basierte Telefonie
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS audio_settings JSONB DEFAULT '{}'::jsonb;

-- Realtime fuer Live-Transkription
ALTER PUBLICATION supabase_realtime ADD TABLE call_transcription_utterances;
