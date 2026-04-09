-- KFZ-154 Follow-up: leads bekommt spezifikation + schadenart Felder, damit
-- der Dispatcher sie aus dem Lead via convertLeadToFall in den Fall uebernehmen
-- kann. Ohne diese Spalten ist der gesamte Dispatcher-Hard-Filter dormant.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS spezifikation TEXT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS schadenart TEXT NULL;
