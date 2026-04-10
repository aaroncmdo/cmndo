-- KFZ-146 v2: Vollständige Lead→Fall Datenübergabe
-- Erweitert nachrichten + fall_dokumente um lead_id
-- Erweitert link_lead_data_to_fall() RPC um nachrichten + fall_dokumente

-- 1. nachrichten: lead_id ergänzen
ALTER TABLE nachrichten ADD COLUMN IF NOT EXISTS lead_id UUID NULL REFERENCES leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_nachrichten_lead ON nachrichten(lead_id) WHERE lead_id IS NOT NULL;

-- 2. fall_dokumente: lead_id ergänzen
ALTER TABLE fall_dokumente ADD COLUMN IF NOT EXISTS lead_id UUID NULL REFERENCES leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fall_dokumente_lead ON fall_dokumente(lead_id) WHERE lead_id IS NOT NULL;

-- 3. Erweiterte RPC: Alle Side-Channel-Daten atomar zuordnen
CREATE OR REPLACE FUNCTION link_lead_data_to_fall(p_lead_id UUID, p_fall_id UUID)
RETURNS JSONB AS $$
DECLARE
  cnt_calls INTEGER := 0;
  cnt_tasks INTEGER := 0;
  cnt_emails INTEGER := 0;
  cnt_termine INTEGER := 0;
  cnt_nachrichten INTEGER := 0;
  cnt_nachrichten_prov INTEGER := 0;
  cnt_dokumente INTEGER := 0;
BEGIN
  -- Calls: fall_id setzen wo noch NULL (Lead-Phase Calls → Fall zuordnen)
  UPDATE calls SET fall_id = p_fall_id, updated_at = now()
    WHERE lead_id = p_lead_id AND fall_id IS NULL;
  GET DIAGNOSTICS cnt_calls = ROW_COUNT;

  -- Tasks: fall_id setzen wo noch NULL
  UPDATE tasks SET fall_id = p_fall_id
    WHERE lead_id = p_lead_id AND fall_id IS NULL;
  GET DIAGNOSTICS cnt_tasks = ROW_COUNT;

  -- Email-Log: lead_id auf bestehende fall-emails setzen (Provenance)
  UPDATE email_log SET lead_id = p_lead_id
    WHERE fall_id = p_fall_id AND lead_id IS NULL;
  GET DIAGNOSTICS cnt_emails = ROW_COUNT;

  -- Gutachter-Termine: fall_id setzen wo noch NULL
  UPDATE gutachter_termine SET fall_id = p_fall_id
    WHERE lead_id = p_lead_id AND fall_id IS NULL;
  GET DIAGNOSTICS cnt_termine = ROW_COUNT;

  -- Nachrichten: Lead-Phase → Fall zuordnen
  UPDATE nachrichten SET fall_id = p_fall_id
    WHERE lead_id = p_lead_id AND fall_id IS NULL;
  GET DIAGNOSTICS cnt_nachrichten = ROW_COUNT;

  -- Nachrichten: Fall-Nachrichten → Lead-Provenance setzen
  UPDATE nachrichten SET lead_id = p_lead_id
    WHERE fall_id = p_fall_id AND lead_id IS NULL;
  GET DIAGNOSTICS cnt_nachrichten_prov = ROW_COUNT;

  -- Fall-Dokumente: lead_id für Provenance setzen
  UPDATE fall_dokumente SET lead_id = p_lead_id
    WHERE fall_id = p_fall_id AND lead_id IS NULL;
  GET DIAGNOSTICS cnt_dokumente = ROW_COUNT;

  RETURN jsonb_build_object(
    'calls', cnt_calls,
    'tasks', cnt_tasks,
    'emails', cnt_emails,
    'termine', cnt_termine,
    'nachrichten', cnt_nachrichten + cnt_nachrichten_prov,
    'dokumente', cnt_dokumente
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
