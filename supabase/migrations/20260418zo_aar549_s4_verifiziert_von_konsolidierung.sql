-- AAR-549 S4: Verifiziert-Von-Konsolidierung auf sachverstaendige.
--
-- Vorher: zwei Spalten für dieselbe Information (wer hat Tier-2-Verifizierung freigegeben):
--   - verifiziert_von (uuid, FK → profiles, altere Spalte aus sachverstaendige-Basis)
--   - verifiziert_von_user_id (uuid, FK → profiles, neu in AAR-359 W1 20260417j)
--
-- Nachher: nur noch verifiziert_von (FK-Semantik, kürzerer Name, schema-konsistent
-- mit verifiziert / verifiziert_am).
--
-- Regel #14 Verification (Stand 2026-04-18):
--   - 4/4 SVs haben verifiziert_von IS NULL
--   - 4/4 SVs haben verifiziert_von_user_id IS NULL
--   - 0 divergente Rows → kein Backfill nötig
--
-- Code-Sweep:
--   - verifizierung-actions.ts (tier2Freigeben): verifiziert_von_user_id → verifiziert_von
--   - database.types.ts: Row/Insert/Update + Relationship-Entry entfernt
-- DROP COLUMN droppt den FK sachverstaendige_verifiziert_von_user_id_fkey automatisch.

ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS verifiziert_von_user_id;

COMMENT ON COLUMN sachverstaendige.verifiziert_von IS
  'Admin-User der Tier-2-Verifizierung freigegeben hat (FK → profiles). Kanonische Quelle seit AAR-549 S4 (ersetzt verifiziert_von_user_id).';
