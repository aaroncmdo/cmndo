-- AAR-318 Teil D: Geburtsdatum des Fahrzeughalters fehlte komplett.
-- Wird im Anspruchsschreiben/Vollmacht von der Kanzlei benötigt.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS halter_geburtsdatum date;
ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS halter_geburtsdatum date;

COMMENT ON COLUMN leads.halter_geburtsdatum IS 'AAR-318: Geburtsdatum des Fahrzeughalters — manuell oder aus Kundendaten (steht nicht im Fahrzeugschein/ZB1).';
COMMENT ON COLUMN faelle.halter_geburtsdatum IS 'AAR-318: Geburtsdatum des Fahrzeughalters — aus leads.halter_geburtsdatum übernommen.';;
