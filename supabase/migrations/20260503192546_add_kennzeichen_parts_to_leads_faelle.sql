-- Kennzeichen-Teile auf leads + faelle getrennt speichern.
-- Stadt (Kreis), Kennung (Buchstaben), Zahl und Fahrzeugspezifikation
-- (E = Elektro, H = Oldtimer) werden separat abgelegt und beim
-- Konvertieren in claim_parties strukturiert weitergegeben.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS kennzeichen_kreis       text,
  ADD COLUMN IF NOT EXISTS kennzeichen_buchstaben  text,
  ADD COLUMN IF NOT EXISTS kennzeichen_zahl        text,
  ADD COLUMN IF NOT EXISTS kennzeichen_suffix      text;

ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS kennzeichen_kreis       text,
  ADD COLUMN IF NOT EXISTS kennzeichen_buchstaben  text,
  ADD COLUMN IF NOT EXISTS kennzeichen_zahl        text,
  ADD COLUMN IF NOT EXISTS kennzeichen_suffix      text;

-- Bestehende Zeilen backfillen — Regex-Split des kombinierten Strings.
-- Format: "K-AS 1234E" → kreis=K, buchstaben=AS, zahl=1234, suffix=E
UPDATE leads
SET
  kennzeichen_kreis      = (regexp_match(upper(kennzeichen), '^([A-Z]{1,3})[- ]'))[1],
  kennzeichen_buchstaben = (regexp_match(upper(kennzeichen), '^[A-Z]{1,3}[- ]([A-Z]{1,2})'))[1],
  kennzeichen_zahl       = (regexp_match(upper(kennzeichen), '(\d{1,4})[EH]?$'))[1],
  kennzeichen_suffix     = (regexp_match(upper(kennzeichen), '\d{1,4}([EH])$'))[1]
WHERE kennzeichen IS NOT NULL;

UPDATE faelle
SET
  kennzeichen_kreis      = (regexp_match(upper(kennzeichen), '^([A-Z]{1,3})[- ]'))[1],
  kennzeichen_buchstaben = (regexp_match(upper(kennzeichen), '^[A-Z]{1,3}[- ]([A-Z]{1,2})'))[1],
  kennzeichen_zahl       = (regexp_match(upper(kennzeichen), '(\d{1,4})[EH]?$'))[1],
  kennzeichen_suffix     = (regexp_match(upper(kennzeichen), '\d{1,4}([EH])$'))[1]
WHERE kennzeichen IS NOT NULL;