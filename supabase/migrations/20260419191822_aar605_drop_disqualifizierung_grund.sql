-- AAR-605: leads.disqualifizierung_grund (Orphan ohne 's') droppen
-- Kein Backfill nötig — 0 Rows hatten einen Wert in dieser Spalte
-- Canonical field: leads.disqualifiziert_grund

ALTER TABLE leads DROP COLUMN IF EXISTS disqualifizierung_grund;
