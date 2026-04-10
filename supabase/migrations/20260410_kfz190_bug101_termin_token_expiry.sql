-- BUG-101: SV-Termin ablehnen_token Expiry
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS ablehnen_token_expires_at TIMESTAMPTZ;

-- Bestehende Tokens: 7 Tage ab Erstellung setzen
UPDATE gutachter_termine
  SET ablehnen_token_expires_at = created_at + interval '7 days'
  WHERE ablehnen_token IS NOT NULL AND ablehnen_token_expires_at IS NULL;
