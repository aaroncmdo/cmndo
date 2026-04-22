-- AAR-702: Token-basierter Mini-Flow für Kunde-Response auf SV-Gegenvorschlag.
--
-- Ablauf:
--   1. SV bekommt Email mit Termin → klickt Verschieben/Ablehnen via /sv/termin/<ablehnen_token>
--   2. SV macht Gegenvorschlag → terminGegenvorschlag generiert kunde_response_token
--   3. Kunde bekommt Email mit Link /kunde-termin/<kunde_response_token>
--   4. Kunde klickt „Annehmen" → status='bestaetigt' + bestaetigeTermin()
--      ODER „Eigener Vorschlag" → setzt gegenvorschlag_von='kunde' + neue Mail an SV.
--
-- 7-Tage TTL analog ablehnen_token (AAR-134).

ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS kunde_response_token TEXT,
  ADD COLUMN IF NOT EXISTS kunde_response_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_gutachter_termine_kunde_response_token
  ON public.gutachter_termine(kunde_response_token)
  WHERE kunde_response_token IS NOT NULL;

COMMENT ON COLUMN public.gutachter_termine.kunde_response_token IS
  'AAR-702: Magic-Link-Token für Kunden-Response auf SV-Gegenvorschlag (7d TTL).';
