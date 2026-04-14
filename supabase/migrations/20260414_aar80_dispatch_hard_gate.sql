-- AAR-80: Dispatch Schritt 0 Hard Gate Felder
-- Q1 Hergang+Aufklaerung Teilschuld, Q2 Schaden, Q3 Haftpflicht

ALTER TABLE leads ADD COLUMN IF NOT EXISTS schuldfrage TEXT
  CHECK (schuldfrage IN ('gegner', 'unklar', 'eigenverantwortung'));

ALTER TABLE leads ADD COLUMN IF NOT EXISTS aufklaerung_teilschuld_bestaetigt BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS schaden_sichtbar BOOLEAN;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS nutzungsausfall BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS hat_haftpflicht BOOLEAN;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS disqualifikations_grund TEXT;
