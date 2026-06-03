-- P1b/1 (Gutachter-Finder->Self-Service, flow_key=beauftragung): additive Spalte
-- fuer die Kanzlei-Wahl auf dem Lead. Spiegelt gutachter_finder_anfragen.kanzlei_wunsch.
-- nullable + CHECK auf die 3 Optionen aus der bestehenden onboarding-Config.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS kanzlei_wunsch text
  CHECK (kanzlei_wunsch IS NULL OR kanzlei_wunsch IN ('partnerkanzlei', 'eigene_kanzlei', 'keine_kanzlei'));
