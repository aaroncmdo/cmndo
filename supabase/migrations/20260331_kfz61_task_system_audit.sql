-- KFZ-61: Task-System Audit
-- typ Spalte von Enum zu TEXT konvertieren (mehr Flexibilitaet fuer Auto-Tasks)
ALTER TABLE tasks ALTER COLUMN typ TYPE TEXT USING typ::TEXT;

-- 10 realistische Auto-Tasks fuer bestehende Faelle geseedet (via SQL Editor)
-- autoPhase.ts triggert jetzt automatisch Tasks bei Phasenwechsel
