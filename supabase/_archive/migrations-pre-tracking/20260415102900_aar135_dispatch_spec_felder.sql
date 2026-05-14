-- AAR-135 / W1: Notion Master-Spec 14.04.2026 — 6 fehlende Dispatch-Felder
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS fahrerflucht boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auslandskennzeichen boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS zeugen boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gegner_schadennummer text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS unfall_uhrzeit text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fahrzeug_fahrbereit boolean DEFAULT NULL;

COMMENT ON COLUMN leads.fahrerflucht IS 'AAR-135 W1: Unfallgegner ist geflüchtet';
COMMENT ON COLUMN leads.auslandskennzeichen IS 'AAR-135 W1: Gegner hat Auslandskennzeichen (braucht erweiterte Recherche)';
COMMENT ON COLUMN leads.zeugen IS 'AAR-135 W1: Zeugen am Unfallort vorhanden';
COMMENT ON COLUMN leads.gegner_schadennummer IS 'AAR-135 W1: Schadennummer der gegnerischen Versicherung';
COMMENT ON COLUMN leads.unfall_uhrzeit IS 'AAR-135 W1: Uhrzeit des Unfalls (Text, ca-Angabe erlaubt)';
COMMENT ON COLUMN leads.fahrzeug_fahrbereit IS 'AAR-135 W1: Fahrzeug ist nach Unfall noch fahrbereit (für Termin-Logistik)';;
