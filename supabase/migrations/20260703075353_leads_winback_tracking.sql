-- Win-back-Reaktivierungs-Kampagne: Idempotenz + Opt-out für erholbare tote Leads.
-- Additiv (nullable / defaulted) → sicher vor Code-Merge applizierbar (Regel 3: kein DROP).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS winback_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS winback_opt_out boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN leads.winback_sent_at IS 'Zeitpunkt der einmaligen Win-back-Reaktivierungs-Mail (Idempotenz). NULL = noch nicht gesendet.';
COMMENT ON COLUMN leads.winback_opt_out IS 'Lead hat sich von Reaktivierungs-Mails abgemeldet (Abmelde-Link / List-Unsubscribe). true = nie wieder kontaktieren.';
