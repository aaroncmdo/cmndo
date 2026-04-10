-- KFZ-146: Fehlende Spalten auf faelle fuer vollstaendige Lead-Uebergabe
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS fin TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS source_channel TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS source_domain TEXT;
