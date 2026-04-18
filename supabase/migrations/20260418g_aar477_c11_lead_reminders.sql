-- AAR-477 C11: Lead-Reminder-Kaskade (2h/24h/72h) + 7-Tage-Timeout.
--
-- Ziel: Wenn ein Lead in Schritt 1 angelegt wurde aber kein Fall (faelle.lead_id)
-- daraus entstanden ist, versenden wir 3 Resume-Mails mit Magic-Link. Nach 7
-- Tagen ohne Konvertierung wird der Lead disqualifiziert (kein weiterer Spam).
--
-- Spalten:
--   reminder_token UUID DEFAULT gen_random_uuid() — pro Lead einzigartiger Token
--     für /schaden-melden/fortsetzen/{token}. Wird beim Insert automatisch
--     befüllt (Default-Klausel), bestehende Leads bekommen via UPDATE einen.
--   reminder_{1,2,3}_sent_at TIMESTAMPTZ — NULL solange nicht versendet, gesetzt
--     sobald Resend den Versand bestätigt hat. IS NULL ist die Kohorten-
--     Bedingung im Cron.
--
-- Achtung: Die Spalte heißt `created_at` (nicht erstellt_am) auf `leads` —
-- bestätigt via information_schema-Query 2026-04-18.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS reminder_token UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS reminder_1_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_2_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_3_sent_at TIMESTAMPTZ;

-- Backfill für bestehende Leads: Default greift nur für INSERT. Alle Rows
-- ohne Token bekommen jetzt einen, damit die UNIQUE-Constraint drunter
-- nicht auf NULLs explodiert.
UPDATE leads SET reminder_token = gen_random_uuid() WHERE reminder_token IS NULL;

-- UNIQUE damit der Token als stabiler Magic-Link funktioniert.
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_reminder_token ON leads(reminder_token);

-- Partial-Index für den Cron-Query: findet alle offenen Self-Service-Leads
-- ohne Fall sehr schnell. status='neu' + disqualifiziert=false deckt ~100 %
-- der Kohorten-Kandidaten ab.
CREATE INDEX IF NOT EXISTS idx_leads_reminder_candidates
  ON leads (created_at)
  WHERE status = 'neu' AND disqualifiziert = false;

-- Timeout-Marker: markiert Leads älter als 7 Tage ohne Fall als
-- disqualifiziert='timeout_7d'. Wird im selben Cron-Tick wie der
-- Reminder-Versand aufgerufen (RPC-Call).
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
COMMENT ON FUNCTION mark_expired_leads IS 'AAR-477 C11: Disqualifiziert Leads > 7 Tage ohne Fall';
