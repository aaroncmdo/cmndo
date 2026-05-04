-- Fehlende Lead-Felder auf claims nachziehen:
--   brn                — Bundesweite Registriernummer (ZB1/OCR)
--   eigene_versicherung — Eigene Kfz-Versicherung des Kunden (Kasko)
--   eigene_policennr   — Policennummer der eigenen Versicherung
--   zeugen_kontakte    — Zeugen-JSONB analog zu leads.zeugen_kontakte
--   spezifikation      — Sonderausstattungs-Notiz des Dispatchers

ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS brn                text,
  ADD COLUMN IF NOT EXISTS eigene_versicherung text,
  ADD COLUMN IF NOT EXISTS eigene_policennr    text,
  ADD COLUMN IF NOT EXISTS zeugen_kontakte     jsonb,
  ADD COLUMN IF NOT EXISTS spezifikation       text;

COMMENT ON COLUMN claims.brn IS 'Bundesweite Registriernummer aus ZB1-OCR (z.B. DE123456789)';
COMMENT ON COLUMN claims.eigene_versicherung IS 'Eigene Kfz-Versicherung des Geschädigten (Kasko/Haftpflicht)';
COMMENT ON COLUMN claims.eigene_policennr IS 'Policennummer der eigenen Versicherung';
COMMENT ON COLUMN claims.zeugen_kontakte IS 'Zeugen-Kontakte als JSONB-Array [{name, telefon, email, anschrift}]';
COMMENT ON COLUMN claims.spezifikation IS 'Sonderausstattung / Spezifikations-Notiz des Dispatchers';
