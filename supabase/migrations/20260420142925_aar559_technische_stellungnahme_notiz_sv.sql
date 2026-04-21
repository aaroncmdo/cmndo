-- AAR-559 (C10): SV-Notiz zum Stellungnahme-Upload.
-- Freitext-Feld das der SV beim Einreichen der technischen Stellungnahme
-- ausfüllen kann (Begleitnotiz / Kurzbeschreibung der Argumentation).
-- Kein NOT NULL -- Upload ist auch ohne Notiz gueltig.

ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS technische_stellungnahme_notiz_sv TEXT;
