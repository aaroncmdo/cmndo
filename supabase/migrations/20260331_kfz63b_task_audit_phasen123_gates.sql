-- KFZ-63b: Task-Audit Nachbesserung - Gate-Logik Spalte
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS gate_task_id UUID REFERENCES tasks(id);
