-- KFZ-7: Gutachter-Terminvergabe - new fields

-- Lead fields for appointment scheduling
ALTER TABLE leads ADD COLUMN IF NOT EXISTS wunschtermin timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fahrzeug_standort_adresse text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fahrzeug_standort_plz text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sa_unterschrieben boolean DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sa_unterschrieben_am timestamptz;

-- Sachverstaendige qualifications
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS qualifikationen text[];
