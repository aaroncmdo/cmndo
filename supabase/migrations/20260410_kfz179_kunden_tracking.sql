-- KFZ-179: Kunden-Tracking fuer SV-Anfahrt (KFZ-158 Phase 5)
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS losgefahren_am TIMESTAMPTZ;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS kunden_tracking_token TEXT UNIQUE;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS notification_losgefahren_gesendet_am TIMESTAMPTZ;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS notification_5min_gesendet_am TIMESTAMPTZ;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS notification_angekommen_gesendet_am TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_termine_tracking_token ON gutachter_termine(kunden_tracking_token) WHERE kunden_tracking_token IS NOT NULL;
