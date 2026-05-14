-- AAR-360: Pro Gutachter konfigurierbare Position der Kunden-Unterschrift
-- auf der SA-Vorlage (pdf-lib overlay). Optional — wenn NULL, nutzt der
-- Merge eine Default-Position (unten links).
--
-- Format:
-- {
--   "unterschrift_position": {"x": 120, "y": 680, "width": 200, "height": 80},
--   "datum_position":        {"x": 120, "y": 760},
--   "name_position":         {"x": 120, "y": 640},
--   "page": 0
-- }
--
-- Koordinaten: pdf-lib nutzt Bottom-Left-Origin, Einheit Points (1/72 inch).
-- "page" ist 0-basiert (erste Seite = 0). Default-Page ist 0.

ALTER TABLE sachverstaendige
  ADD COLUMN IF NOT EXISTS sa_vorlage_signatur_konfig JSONB DEFAULT NULL;

COMMENT ON COLUMN sachverstaendige.sa_vorlage_signatur_konfig IS
  'AAR-360: Position-Konfig fuer SA-Tool-PDF-Merge (Kunden-Unterschrift + Datum + Name auf Gutachter-SA-Vorlage). NULL => Default-Position (unten links). Admin-UI-Editor folgt nach MVP.';
;
