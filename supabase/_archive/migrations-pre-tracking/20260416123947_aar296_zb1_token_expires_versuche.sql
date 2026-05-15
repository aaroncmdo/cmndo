-- AAR-296 W0: Token-Expiry + Upload-Versuche-Counter für ZB1-Web-Upload
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS zb1_token_expires_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS zb1_upload_versuche INTEGER DEFAULT 0;

COMMENT ON COLUMN leads.zb1_token_expires_at IS 'AAR-296: Token-Ablaufdatum (default 7 Tage nach Generierung). NULL=kein Token.';
COMMENT ON COLUMN leads.zb1_upload_versuche IS 'AAR-296: Counter für Upload-Versuche via /upload/zb1/[token]-Page.';;
