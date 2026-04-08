-- KFZ-147: Email senden aus Fallakte + Unified Communication Timeline

-- email_log Erweiterungen
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS richtung TEXT NOT NULL DEFAULT 'outbound' CHECK (richtung IN ('outbound','inbound'));
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS in_reply_to TEXT NULL;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS body_html TEXT NULL;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS body_text TEXT NULL;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS empfaenger_array JSONB NULL;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS cc TEXT[] NULL;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS bcc TEXT[] NULL;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS gesendet_von_user_id UUID NULL;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS thread_id TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_email_log_fall_zeit ON email_log(fall_id, gesendet_am DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_thread ON email_log(thread_id);
