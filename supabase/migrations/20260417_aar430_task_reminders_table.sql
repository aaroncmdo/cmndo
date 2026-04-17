-- AAR-430: Task-Reminder-Kaskade Foundation
CREATE TABLE IF NOT EXISTS task_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  reminder_typ TEXT NOT NULL,
  geplant_fuer TIMESTAMPTZ NOT NULL,
  empfaenger_rolle TEXT,
  kanal TEXT NOT NULL DEFAULT 'system',
  status TEXT NOT NULL DEFAULT 'pending',
  versendet_am TIMESTAMPTZ,
  versuche INTEGER NOT NULL DEFAULT 0,
  fehler TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, reminder_typ)
);

CREATE INDEX IF NOT EXISTS idx_task_reminders_pending ON task_reminders(geplant_fuer) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_task_reminders_task ON task_reminders(task_id);

COMMENT ON TABLE task_reminders IS 'AAR-430: Reminder-Kaskade pro Task, ersetzt tasks.erinnerung_gesendet';
