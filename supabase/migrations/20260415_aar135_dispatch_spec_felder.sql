-- AAR-135 / W1: Notion Master-Spec 14.04.2026 — 6 fehlende Dispatch-Felder.
-- Applied via Supabase MCP auf paizkjajbuxxksdoycev (ACTIVE).
-- Diese Datei dient der Versions-Historie und lokalen Replikation.
--
-- Namens-Mapping zwischen Spec und DB (wichtig für W4-W7):
--   schadentyp_text              → schadentyp_freitext         (existiert)
--   vorschaeden                  → hat_vorschaeden             (existiert)
--   vorschaeden_text             → vorschaeden_beschreibung    (existiert)
--   polizeibericht               → polizeibericht_pflicht      (existiert)
--   polizeibericht_aktenzeichen  → polizei_aktenzeichen        (existiert)
--   marke_modell                 → fahrzeug_hersteller + fahrzeug_modell

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
COMMENT ON COLUMN leads.fahrzeug_fahrbereit IS 'AAR-135 W1: Fahrzeug ist nach Unfall noch fahrbereit';
