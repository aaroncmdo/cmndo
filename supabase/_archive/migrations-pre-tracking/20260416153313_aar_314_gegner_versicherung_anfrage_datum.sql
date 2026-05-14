-- AAR-314: Tracking wann das Deutsche Büro Grüne Karte wegen
-- Auslandskennzeichen angefragt wurde (10-Tage-Wartezeit bis Antwort).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS gegner_versicherung_anfrage_datum date;
ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS gegner_versicherung_anfrage_datum date;

COMMENT ON COLUMN leads.gegner_versicherung_anfrage_datum IS 'AAR-314: Datum der Anfrage beim Deutschen Büro Grüne Karte (deutsches-buero-gruene-karte.de). Nach 10 Tagen kommt die DE-Versicherungs-Eintrittsadresse per Mail.';
COMMENT ON COLUMN faelle.gegner_versicherung_anfrage_datum IS 'AAR-314: Aus leads übertragen.';;
