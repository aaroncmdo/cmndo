ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS reminder_token UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS reminder_1_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_2_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_3_sent_at TIMESTAMPTZ;

UPDATE leads SET reminder_token = gen_random_uuid() WHERE reminder_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_reminder_token ON leads(reminder_token);

CREATE INDEX IF NOT EXISTS idx_leads_reminder_candidates
  ON leads (created_at)
  WHERE status = 'neu' AND disqualifiziert = false;

CREATE OR REPLACE FUNCTION mark_expired_leads() RETURNS void AS $$
BEGIN
  UPDATE leads
  SET
    status = 'disqualifiziert',
    disqualifiziert = true,
    disqualifikations_grund_key = 'timeout_7d',
    updated_at = NOW()
  WHERE status = 'neu'
    AND disqualifiziert = false
    AND created_at < NOW() - INTERVAL '7 days'
    AND NOT EXISTS (SELECT 1 FROM faelle WHERE faelle.lead_id = leads.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN leads.reminder_token IS 'AAR-477 C11: UUID für /schaden-melden/fortsetzen/{token}';
COMMENT ON COLUMN leads.reminder_1_sent_at IS 'AAR-477 C11: Timestamp Reminder-1 (2h) Versand';
COMMENT ON COLUMN leads.reminder_2_sent_at IS 'AAR-477 C11: Timestamp Reminder-2 (24h) Versand';
COMMENT ON COLUMN leads.reminder_3_sent_at IS 'AAR-477 C11: Timestamp Reminder-3 (72h) Versand';
COMMENT ON FUNCTION mark_expired_leads IS 'AAR-477 C11: Disqualifiziert Leads > 7 Tage ohne Fall';;
