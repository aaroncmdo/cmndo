-- AAR-CMM: BRN (Bundesweite Registriernummer) auf leads + faelle
-- ZB1-OCR liest die BRN aus dem Sicherheitsdruck (links unten) bzw. aus
-- Feld I.1 — wir persistieren sie für späteren Salesforce-Sync und
-- Schadenakte-Doppel-Identifikation.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS brn text;

ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS brn text;

COMMENT ON COLUMN leads.brn  IS 'Bundesweite Registriernummer (ZB1 Feld I bzw. Sicherheitsdruck)';
COMMENT ON COLUMN faelle.brn IS 'Bundesweite Registriernummer (ZB1 Feld I bzw. Sicherheitsdruck) — von Lead übernommen';
