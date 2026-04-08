-- KFZ-146: Lead→Fall Datenübergabe — fehlende Spalten + Backfill-Funktion

-- email_log: lead_id ergänzen (hat bisher nur fall_id)
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS lead_id UUID NULL REFERENCES leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_email_log_lead ON email_log(lead_id);

-- leads: konvertiert_zu_fall_id Feld (falls nicht vorhanden)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS konvertiert_zu_fall_id UUID NULL REFERENCES faelle(id) ON DELETE SET NULL;

-- Atomare Funktion: Lead-Side-Channel-Daten an Fall zuordnen
CREATE OR REPLACE FUNCTION link_lead_data_to_fall(p_lead_id UUID, p_fall_id UUID)
RETURNS JSONB AS $$
DECLARE
  cnt_calls INTEGER := 0;
  cnt_tasks INTEGER := 0;
  cnt_emails INTEGER := 0;
  cnt_termine INTEGER := 0;
BEGIN
  -- Calls: fall_id setzen wo noch NULL
  UPDATE calls SET fall_id = p_fall_id, updated_at = now()
    WHERE lead_id = p_lead_id AND fall_id IS NULL;
  GET DIAGNOSTICS cnt_calls = ROW_COUNT;

  -- Tasks: fall_id setzen wo noch NULL
  UPDATE tasks SET fall_id = p_fall_id
    WHERE lead_id = p_lead_id AND fall_id IS NULL;
  GET DIAGNOSTICS cnt_tasks = ROW_COUNT;

  -- Email-Log: lead_id auf bestehende fall-emails setzen
  UPDATE email_log SET lead_id = p_lead_id
    WHERE fall_id = p_fall_id AND lead_id IS NULL;
  GET DIAGNOSTICS cnt_emails = ROW_COUNT;

  -- Gutachter-Termine: fall_id setzen wo noch NULL
  UPDATE gutachter_termine SET fall_id = p_fall_id
    WHERE lead_id = p_lead_id AND fall_id IS NULL;
  GET DIAGNOSTICS cnt_termine = ROW_COUNT;

  RETURN jsonb_build_object(
    'calls', cnt_calls,
    'tasks', cnt_tasks,
    'emails', cnt_emails,
    'termine', cnt_termine
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
