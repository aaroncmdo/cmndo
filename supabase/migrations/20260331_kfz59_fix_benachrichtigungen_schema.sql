-- KFZ-59: Fix benachrichtigungen Schema (fehlende Spalten typ, beschreibung, erstellt_am)
ALTER TABLE benachrichtigungen ADD COLUMN IF NOT EXISTS typ TEXT DEFAULT 'system';
ALTER TABLE benachrichtigungen ADD COLUMN IF NOT EXISTS beschreibung TEXT;
ALTER TABLE benachrichtigungen ADD COLUMN IF NOT EXISTS erstellt_am TIMESTAMPTZ DEFAULT now();

-- Daten aus alten Spalten kopieren
UPDATE benachrichtigungen SET beschreibung = nachricht WHERE beschreibung IS NULL AND nachricht IS NOT NULL;
UPDATE benachrichtigungen SET erstellt_am = created_at WHERE erstellt_am IS NULL AND created_at IS NOT NULL;
