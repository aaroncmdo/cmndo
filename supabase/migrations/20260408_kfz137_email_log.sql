-- KFZ-137: Email-Log Tabelle fuer Google Workspace SMTP Modul

CREATE TABLE IF NOT EXISTS email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id UUID NULL REFERENCES faelle(id) ON DELETE SET NULL,
  empfaenger TEXT NOT NULL,
  empfaenger_typ TEXT NOT NULL CHECK (empfaenger_typ IN ('kunde','sv','kanzlei','admin')),
  template TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','bounced')),
  message_id TEXT NULL,
  fehler TEXT NULL,
  versuche INTEGER NOT NULL DEFAULT 0,
  attachments JSONB NULL,
  gesendet_am TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_fall ON email_log(fall_id);
CREATE INDEX IF NOT EXISTS idx_email_log_status ON email_log(status);
