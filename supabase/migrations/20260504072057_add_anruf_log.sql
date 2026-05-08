-- Anruf-Log: jeder Anrufversuch eines Dispatchers wird protokolliert.
-- Sowohl "Angerufen" (erreicht) als auch "Nicht erreicht" erzeugen einen Eintrag.
-- Ersetzt den rein zählenden leads.anruf_versuche als Verlaufs-Quelle —
-- anruf_versuche bleibt als Quick-Counter für die List-Ansicht erhalten.

CREATE TABLE IF NOT EXISTS anruf_log (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  zeitpunkt      timestamptz NOT NULL DEFAULT now(),
  status         text        NOT NULL CHECK (status IN ('erreicht', 'nicht_erreicht')),
  notiz          text,
  erstellt_von   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS anruf_log_lead_id_idx ON anruf_log (lead_id, zeitpunkt DESC);

-- RLS: Dispatch + Kundenbetreuer + Admin dürfen lesen und schreiben.
ALTER TABLE anruf_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anruf_log_select" ON anruf_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND rolle IN ('dispatch', 'kundenbetreuer', 'admin')
    )
  );

CREATE POLICY "anruf_log_insert" ON anruf_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND rolle IN ('dispatch', 'kundenbetreuer', 'admin')
    )
  );