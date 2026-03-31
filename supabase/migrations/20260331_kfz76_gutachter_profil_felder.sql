-- KFZ-76: Zusätzliche Felder für Gutachter-Profil
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS urlaub_von DATE;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS urlaub_bis DATE;
