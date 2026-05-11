-- Schema-Cleanup: neue Spalten für dynamisches Onboarding-Wizard auf gutachter_finder_anfragen.
-- Alle Felder werden via DynamicWizard / saveOnboardingStep direkt befüllt (db_target).
-- Bestehende Zeilen erhalten NULL — alle Spalten sind nullable (kein NOT NULL ohne DEFAULT).

ALTER TABLE gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS schuldfrage          TEXT CHECK (schuldfrage IN ('gegner', 'unklar', 'teilschuld')),
  ADD COLUMN IF NOT EXISTS fahrzeug_fahrbereit  BOOLEAN,
  ADD COLUMN IF NOT EXISTS schadens_kurzbeschreibung TEXT,
  ADD COLUMN IF NOT EXISTS fahrzeug_baujahr     INT,
  ADD COLUMN IF NOT EXISTS fahrzeug_hersteller  TEXT,
  ADD COLUMN IF NOT EXISTS fahrzeug_modell      TEXT,
  ADD COLUMN IF NOT EXISTS fahrzeugtyp          TEXT CHECK (fahrzeugtyp IN ('pkw', 'motorrad', 'transporter', 'lkw', 'wohnmobil')),
  ADD COLUMN IF NOT EXISTS wunschtermin_wann    TEXT CHECK (wunschtermin_wann IN ('sofort', 'heute', 'tage')),
  ADD COLUMN IF NOT EXISTS bevorzugter_kanal    TEXT CHECK (bevorzugter_kanal IN ('whatsapp', 'email', 'anruf')),
  ADD COLUMN IF NOT EXISTS dsgvo_zustimmung_am  TIMESTAMPTZ;

COMMENT ON COLUMN gutachter_finder_anfragen.schuldfrage           IS 'Schuldfrage aus Phase Schaden: gegner | unklar | teilschuld';
COMMENT ON COLUMN gutachter_finder_anfragen.fahrzeug_fahrbereit   IS 'Ist das Fahrzeug noch fahrbereit?';
COMMENT ON COLUMN gutachter_finder_anfragen.schadens_kurzbeschreibung IS 'Freitext-Kurzbeschreibung des Schadens (ergänzt schadentyp)';
COMMENT ON COLUMN gutachter_finder_anfragen.fahrzeug_baujahr      IS 'Baujahr des beschädigten Fahrzeugs';
COMMENT ON COLUMN gutachter_finder_anfragen.fahrzeug_hersteller   IS 'Hersteller / Marke des Fahrzeugs, z.B. BMW, VW';
COMMENT ON COLUMN gutachter_finder_anfragen.fahrzeug_modell       IS 'Modell des Fahrzeugs, z.B. 3er, Golf';
COMMENT ON COLUMN gutachter_finder_anfragen.fahrzeugtyp           IS 'Fahrzeugkategorie für SV-Spezialisierung: pkw | motorrad | transporter | lkw | wohnmobil';
COMMENT ON COLUMN gutachter_finder_anfragen.wunschtermin_wann     IS 'Zeitpräferenz aus Phase Termin: sofort | heute | tage';
COMMENT ON COLUMN gutachter_finder_anfragen.bevorzugter_kanal     IS 'Bevorzugter Kontaktkanal: whatsapp | email | anruf';
COMMENT ON COLUMN gutachter_finder_anfragen.dsgvo_zustimmung_am   IS 'Zeitstempel der DSGVO-Einwilligung — muss vor erstem saveOnboardingStep gesetzt sein';
