ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS vs_kuerzung_grund text,
  ADD COLUMN IF NOT EXISTS geschlossen_grund text,
  ADD COLUMN IF NOT EXISTS nachbesichtigung_ergebnis text;

ALTER TABLE termine
  ADD COLUMN IF NOT EXISTS verschiebung_grund text;

COMMENT ON COLUMN faelle.vs_kuerzung_grund IS 'AAR-161 W1: Freitext-Grund der VS-Kürzung (aus LexDrive-Webhook vs_kuerzt)';
COMMENT ON COLUMN faelle.geschlossen_grund IS 'AAR-161 W1: Grund beim Fall-Abschluss (abgeschlossen / mit Klage / storniert)';
COMMENT ON COLUMN faelle.nachbesichtigung_ergebnis IS 'AAR-161 W1: Ergebnis der Nachbesichtigung (reguliert/kuerzt/ablehnt)';
COMMENT ON COLUMN termine.verschiebung_grund IS 'AAR-161 W1: SV-Terminverschiebung (nachbesichtigung/krankheit/fahrzeug_nicht_verfuegbar/technische_stellungnahme_ausstehend)';;
