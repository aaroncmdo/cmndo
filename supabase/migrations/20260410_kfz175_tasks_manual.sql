-- KFZ-175: Manuelle Tasks — erstellt_von_id + Indices
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS erstellt_von_id UUID;
CREATE INDEX IF NOT EXISTS idx_tasks_zugewiesen_status ON tasks(zugewiesen_an, status) WHERE status != 'erledigt';
CREATE INDEX IF NOT EXISTS idx_tasks_fall ON tasks(fall_id) WHERE fall_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(lead_id) WHERE lead_id IS NOT NULL;
