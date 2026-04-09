-- KFZ-154 Cleanup: alte qualifikationen-Spalte droppen.
-- Alle Read- und Write-Pfade wurden auf qualifikationen_neu umgestellt
-- (siehe commit dieser Migration). Daten wurden in der vorherigen kfz154
-- Migration via Backfill in qualifikationen_neu uebertragen.
ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS qualifikationen;
