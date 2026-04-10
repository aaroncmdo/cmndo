-- BUG-78: schadensursache Duplikat-Spalte auf faelle entfernen.
-- faelle hatte sowohl schadens_ursache (40+ Code-Refs) als auch schadensursache (aus Flow-Wizard).
-- Daten gemerged, Duplikat gedroppt. leads.schadensursache bleibt (korrekt, andere Tabelle).
UPDATE faelle SET schadens_ursache = COALESCE(schadens_ursache, schadensursache)
WHERE schadens_ursache IS NULL AND schadensursache IS NOT NULL;
ALTER TABLE faelle DROP COLUMN IF EXISTS schadensursache;
