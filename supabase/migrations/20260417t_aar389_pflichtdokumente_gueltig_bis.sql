-- AAR-389: Haftpflicht-Ablauf-Tracking (post-MVP)
--
-- Ergänzt pflichtdokumente um gueltig_bis (DATE), damit Haftpflicht-Policen
-- und andere fristen-behaftete SV-Dokumente ein Ablaufdatum tragen können.
--
-- Reminder-Sequenz (-30/-14/-7/0 Tage) läuft im neuen Cron
-- /api/cron/haftpflicht-ablauf und legt Auto-Tasks für den SV an.

ALTER TABLE pflichtdokumente
  ADD COLUMN IF NOT EXISTS gueltig_bis DATE;

CREATE INDEX IF NOT EXISTS idx_pflichtdokumente_gueltig_bis
  ON pflichtdokumente(gueltig_bis)
  WHERE gueltig_bis IS NOT NULL;

COMMENT ON COLUMN public.pflichtdokumente.gueltig_bis IS
  'AAR-389: Ablaufdatum des Dokuments (primär Berufshaftpflicht). NULL = kein Ablauf relevant. Der Cron /api/cron/haftpflicht-ablauf prüft täglich und legt Reminder-Tasks an den Gutachter an (-30/-14/-7/0 Tage vor Ablauf).';
