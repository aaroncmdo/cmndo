-- CMM: Kennzeichen-Splitter-Felder auf claim_parties
-- Die Lead-Konvertierung schreibt kennzeichen_kreis/buchstaben/zahl/suffix,
-- aber claim_parties hatte nur kennzeichen (Vollstring). Dadurch scheiterte
-- der claim_parties-Insert mit "column not found in schema cache".

ALTER TABLE claim_parties
  ADD COLUMN IF NOT EXISTS kennzeichen_kreis      text,
  ADD COLUMN IF NOT EXISTS kennzeichen_buchstaben text,
  ADD COLUMN IF NOT EXISTS kennzeichen_zahl       text,
  ADD COLUMN IF NOT EXISTS kennzeichen_suffix     text;

COMMENT ON COLUMN claim_parties.kennzeichen_kreis      IS 'Kennzeichen-Unterscheidungszeichen (z. B. M, B, HH)';
COMMENT ON COLUMN claim_parties.kennzeichen_buchstaben IS 'Erkennungsnummer Buchstaben-Teil';
COMMENT ON COLUMN claim_parties.kennzeichen_zahl       IS 'Erkennungsnummer Zahlen-Teil';
COMMENT ON COLUMN claim_parties.kennzeichen_suffix     IS 'E-Kennzeichen-Suffix (E, H, ...) oder null';
