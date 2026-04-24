-- AAR-764 Phase 2: Task-Eskalations-Tracking.
--
-- Neuer Timestamp auf tasks. Wird vom Eskalations-Cron (runEskalationsCron)
-- gesetzt wenn ein Task aufgrund stiller Reminder an die höhere Rolle
-- eskaliert wurde. Verhindert doppelte Eskalation (Cron filtert
-- `eskaliert_am IS NULL`).

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS eskaliert_am timestamptz;

COMMENT ON COLUMN public.tasks.eskaliert_am IS
  'AAR-764: Zeitstempel wann der Task via Eskalations-Cron an eine höhere Rolle weitergegeben wurde. NULL = noch nicht eskaliert.';

-- Partial Index für den Cron-Filter (findet offene, auto-erstellte,
-- noch-nicht-eskalierte Tasks schnell).
CREATE INDEX IF NOT EXISTS idx_tasks_auto_not_eskaliert
  ON public.tasks (trigger_event, empfaenger_rolle)
  WHERE auto_erstellt = true AND status = 'offen' AND eskaliert_am IS NULL;
