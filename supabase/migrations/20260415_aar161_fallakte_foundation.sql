-- AAR-161 / W1: Fallakte-Foundation — 3 fehlende DB-Felder.
-- Applied via Supabase MCP auf paizkjajbuxxksdoycev (ACTIVE).
-- Diese Datei dient der Versions-Historie und lokalen Replikation.
--
-- Hintergrund: Die Notion-Spec sagt explizit "nur 3 Felder fehlen" (siehe
-- 3431da4c9124814db2ecf2d7e613de03). Alle anderen Felder für Stellungnahme,
-- Nachbesichtigung, FIN, Vorschäden, Rüge, Kernwerte, Halter existieren bereits.
-- termine.verschiebung_grund war im Spec-Text auch aufgeführt, existiert in
-- der DB bereits — IF NOT EXISTS macht die Migration idempotent.

ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS vs_kuerzung_grund text,
  ADD COLUMN IF NOT EXISTS geschlossen_grund text,
  ADD COLUMN IF NOT EXISTS nachbesichtigung_ergebnis text;

ALTER TABLE termine
  ADD COLUMN IF NOT EXISTS verschiebung_grund text;

COMMENT ON COLUMN faelle.vs_kuerzung_grund IS 'AAR-161 W1: Freitext-Grund der VS-Kürzung (aus LexDrive-Webhook vs_kuerzt)';
COMMENT ON COLUMN faelle.geschlossen_grund IS 'AAR-161 W1: Grund beim Fall-Abschluss (abgeschlossen / mit Klage / storniert)';
COMMENT ON COLUMN faelle.nachbesichtigung_ergebnis IS 'AAR-161 W1: Ergebnis der Nachbesichtigung (reguliert/kuerzt/ablehnt, aus Webhook vs_nachbesichtigung_ergebnis)';
COMMENT ON COLUMN termine.verschiebung_grund IS 'AAR-161 W1: SV-Terminverschiebung (nachbesichtigung/krankheit/fahrzeug_nicht_verfuegbar/technische_stellungnahme_ausstehend)';
