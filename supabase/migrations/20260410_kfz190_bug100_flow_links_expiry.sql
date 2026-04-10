-- BUG-100: FlowLink Token-Expiry
ALTER TABLE flow_links ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Bestehende flow_links: 72h ab Erstellung
UPDATE flow_links SET expires_at = erstellt_am + interval '72 hours'
  WHERE expires_at IS NULL;
