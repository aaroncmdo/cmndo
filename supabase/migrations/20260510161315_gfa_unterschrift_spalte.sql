-- PR 5: Unterschrift-Spalte auf gutachter_finder_anfragen
-- Speichert die SVG/PNG Data-URL der Kunden-Signatur aus dem Wizard-Abschluss-Step.

ALTER TABLE gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS unterschrift_data_url TEXT;

COMMENT ON COLUMN gutachter_finder_anfragen.unterschrift_data_url IS
  'PR 5: Base64 Data-URL der Kunden-Signatur aus dem Wizard-Abschluss-Step.
   Format: data:image/png;base64,...';
