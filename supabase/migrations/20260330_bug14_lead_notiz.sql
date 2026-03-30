-- BUG-14: Sicherstellen dass leads.notiz Spalte existiert
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notiz TEXT;
