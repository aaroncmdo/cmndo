-- KFZ-97: Soft-Delete + Deaktivierungs-Management für Gutachter
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS geloescht_am TIMESTAMPTZ;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS deaktiviert_grund TEXT;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS deaktiviert_am TIMESTAMPTZ;
