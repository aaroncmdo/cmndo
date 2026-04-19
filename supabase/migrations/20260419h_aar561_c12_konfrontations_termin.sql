-- AAR-561 (C12) Konfrontations-Dispatch-Lite
-- ==========================================
-- Erweitert gutachter_termine um Bezahl-Flag + Honorar-Betrag, damit eine
-- Konfrontations-Begleitung (SV-Reuse ohne neuen Auftrag) als separate Row
-- getrackt werden kann ohne Vermischung mit bezahlten Erstbesichtigungs-
-- oder Nachbesichtigungs-Terminen.
--
-- Konvention:
--   typ = 'konfrontation' → SV begleitet VS-Gutachter bei Nachbesichtigung,
--                           keine neue Bezahlung (bezahlt=false, honorar_betrag=0)
--   typ = 'erstbesichtigung' | 'nachbesichtigung' → bezahlt=true (Default)
--
-- bezahlt + honorar_betrag sind OPTIONAL; existierende Rows behalten bezahlt=true
-- (via DEFAULT) und honorar_betrag=NULL (Altrows unverändert gültig).

ALTER TABLE gutachter_termine
  ADD COLUMN IF NOT EXISTS bezahlt BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS honorar_betrag NUMERIC(10, 2);

COMMENT ON COLUMN gutachter_termine.bezahlt IS
  'AAR-561: false für Konfrontations-Begleit-Termine (SV-Reuse ohne neue Bezahlung). Default true für Standard-Termine.';

COMMENT ON COLUMN gutachter_termine.honorar_betrag IS
  'AAR-561: Honorar für diesen konkreten Termin in EUR. NULL für Altrows, 0 für Konfrontations-Termine.';
