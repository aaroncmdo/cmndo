ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS gutachter_typ TEXT DEFAULT 'kfz-gutachter' CHECK (gutachter_typ IN ('kfz-gutachter','dat-gutachter','akademie','gutachterbuero'));
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS anzahlung_faellig DECIMAL(10,2) DEFAULT 0;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS anzahlung_status TEXT DEFAULT 'offen' CHECK (anzahlung_status IN ('offen','teilweise','bezahlt'));
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS onboarding_abgeschlossen BOOLEAN DEFAULT false;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS guthaben DECIMAL(10,2) DEFAULT 0;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS notizen TEXT;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS qualifikationen TEXT[] DEFAULT ARRAY[]::TEXT[];
