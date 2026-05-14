ALTER TABLE pflichtdokumente
  ADD COLUMN IF NOT EXISTS gueltig_bis DATE;

CREATE INDEX IF NOT EXISTS idx_pflichtdokumente_gueltig_bis
  ON pflichtdokumente(gueltig_bis)
  WHERE gueltig_bis IS NOT NULL;

COMMENT ON COLUMN public.pflichtdokumente.gueltig_bis IS
  'AAR-389: Ablaufdatum des Dokuments (primär Berufshaftpflicht). NULL = kein Ablauf relevant. Der Cron /api/cron/haftpflicht-ablauf prüft täglich und legt Reminder-Tasks an den Gutachter an (-30/-14/-7/0 Tage vor Ablauf).';;
