-- AAR-548 D11: Vorschäden-Booleans sind KEINE Duplikate (Doc-only).
--
-- Regel-#14-Daten-Check (14 Rows):
--   7 Rows: hat_vorschaeden=false, geprueft=false, erkannt=false
--   7 Rows: hat_vorschaeden=true,  geprueft=false, erkannt=false
--
-- Die drei Flags decken 3 getrennte Lebenszyklus-Phasen ab:
--   1. hat_vorschaeden      — User-Angabe im Schaden-Melden-Flow (self-reported)
--   2. vorschaden_geprueft  — CardEntity-Query wurde ausgeführt (prozess-state)
--   3. vorschaden_erkannt   — CardEntity-Ergebnis (system-truth, überstimmt Self-Report)
--
-- Konsequenz: KEIN Drop, sondern Docs so dass zukünftige Devs nicht
-- fälschlich konsolidieren.

COMMENT ON COLUMN faelle.hat_vorschaeden IS
  'User-Self-Report beim Schaden-Melden: "Gab es frühere Schäden?". Default false. '
  'NICHT Truth — kann gegen vorschaden_erkannt abweichen (dann lügt User oder CardEntity hat was gefunden).';

COMMENT ON COLUMN faelle.vorschaden_geprueft IS
  'Prozess-Flag: CardEntity-Abfrage für diesen Fall wurde durchgeführt. '
  'Default false. Wird gesetzt wenn cardentity_abfrage_am befüllt wird.';

COMMENT ON COLUMN faelle.vorschaden_erkannt IS
  'System-Truth: CardEntity hat Vorschäden gefunden. NOT NULL default false. '
  'Nur verlässlich wenn vorschaden_geprueft = true. Überstimmt hat_vorschaeden.';
