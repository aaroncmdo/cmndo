-- KFZ-119: Rollenbasierte Terminvergabe — erweiterte Termin-Typen
ALTER TABLE termine ADD COLUMN IF NOT EXISTS erstellt_von_user_id UUID;
ALTER TABLE termine ADD COLUMN IF NOT EXISTS erstellt_von_rolle TEXT;
ALTER TABLE termine ADD COLUMN IF NOT EXISTS kontakt_name TEXT;
ALTER TABLE termine ADD COLUMN IF NOT EXISTS kontakt_telefon TEXT;
ALTER TABLE termine ADD COLUMN IF NOT EXISTS thema TEXT;

-- typ erweitern (Check Constraint nur wenn nicht existiert)
DO $$ BEGIN
  ALTER TABLE termine DROP CONSTRAINT IF EXISTS termine_typ_check;
  ALTER TABLE termine ADD CONSTRAINT termine_typ_check
    CHECK (typ IN ('telefonat', 'video-call', 'rueckruf', 'kundentermin', 'intern', 'gutachter_termin'));
EXCEPTION WHEN others THEN NULL;
END $$;
