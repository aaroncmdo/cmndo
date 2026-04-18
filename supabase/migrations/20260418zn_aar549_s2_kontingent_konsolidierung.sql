-- AAR-549 S2: Kontingent-Konsolidierung auf sachverstaendige.
--
-- Vorher: drei Spalten für dieselbe Zahl (monatliches Fall-Kontingent):
--   - max_faelle_monat (numeric, NOT NULL, vom Onboarding-Wizard gesetzt)
--   - paket_faelle_gesamt (numeric, autoritativ seit AAR-209)
--   - kontingent_soll (numeric, nie benutzt in prod-data)
--
-- Nachher: nur noch paket_faelle_gesamt.
--
-- Regel #14 Verification (Stand 2026-04-18):
--   - 4/4 SVs haben max_faelle_monat === paket_faelle_gesamt (identisch)
--   - 0/4 SVs haben kontingent_soll gesetzt
--   - 0 divergente Rows → kein GREATEST-Backfill nötig
--
-- Code-Sweep (siehe Commit-Body): 20+ Dateien auf paket_faelle_gesamt migriert.
-- Shared-Helper lib/sachverstaendige/kontingent.ts vereinfacht (nur noch eine Quelle).

ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS max_faelle_monat;
ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS kontingent_soll;

COMMENT ON COLUMN sachverstaendige.paket_faelle_gesamt IS
  'Monatliches Fall-Kontingent — kanonische Quelle (ersetzt max_faelle_monat, kontingent_soll seit AAR-549 S2).';
