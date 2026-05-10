-- AAR: Audit-Felder für nachrichten — wird vom Send-Wrapper
-- (lib/whatsapp/send.ts) genutzt um System-Sends zu protokollieren.
--
-- Existierende Spalten bleiben unverändert. Wir ergänzen nur was für
-- Multi-Channel-Audit + Delivery-Tracking nötig ist.

ALTER TABLE nachrichten
  ADD COLUMN IF NOT EXISTS external_message_id TEXT,
  ADD COLUMN IF NOT EXISTS empfaenger_kontakt TEXT,
  ADD COLUMN IF NOT EXISTS template_key TEXT,
  ADD COLUMN IF NOT EXISTS fehlermeldung TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT
    CHECK (status IS NULL OR status IN ('gesendet', 'fehlgeschlagen', 'zugestellt', 'gelesen', 'queued'));

CREATE INDEX IF NOT EXISTS idx_nachrichten_external_message_id
  ON nachrichten (external_message_id) WHERE external_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nachrichten_status
  ON nachrichten (status) WHERE status IS NOT NULL;

COMMENT ON COLUMN nachrichten.external_message_id IS
  'ID des externen Provider-Messages (Baileys jid+id, Twilio MessageSid, Resend message-id). Für Delivery-Webhook-Lookup.';
COMMENT ON COLUMN nachrichten.empfaenger_kontakt IS
  'Konkrete Kontakt-Adresse (Phone für WA/SMS, Email-Adresse für Email). Komplementär zu empfaenger_id welche auf einen User-Eintrag zeigt.';
COMMENT ON COLUMN nachrichten.template_key IS
  'Identifier des Message-Templates für Reporting + A/B-Testing.';
COMMENT ON COLUMN nachrichten.fehlermeldung IS
  'Fehler-Detail wenn status=fehlgeschlagen.';
COMMENT ON COLUMN nachrichten.status IS
  'Send-Status: queued, gesendet, zugestellt, gelesen, fehlgeschlagen.';
