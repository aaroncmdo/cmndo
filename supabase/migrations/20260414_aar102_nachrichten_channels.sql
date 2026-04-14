-- AAR-102: Multi-Channel Inbox - kanal-Werte normalisieren + CHECK constraint + Indexes
UPDATE nachrichten SET kanal = 'chat_kb_kunde' WHERE kanal IN ('chat', 'kb_chat', 'kunden_chat', 'portal-kunde-claimondo');
UPDATE nachrichten SET kanal = 'chat_kunde_sv' WHERE kanal IN ('portal-kunde-gutachter');
UPDATE nachrichten SET kanal = 'whatsapp' WHERE kanal IN ('wa', 'twilio');

ALTER TABLE nachrichten DROP CONSTRAINT IF EXISTS nachrichten_kanal_check;
ALTER TABLE nachrichten ADD CONSTRAINT nachrichten_kanal_check
  CHECK (kanal IN ('whatsapp', 'chat_kb_kunde', 'gruppenchat', 'chat_kunde_sv', 'chat_kb_sv'));

CREATE INDEX IF NOT EXISTS idx_nachrichten_fall_kanal_created ON nachrichten(fall_id, kanal, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nachrichten_unread ON nachrichten(empfaenger_id, gelesen) WHERE gelesen = false;
