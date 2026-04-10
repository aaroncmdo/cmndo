-- KFZ-152 Phase 3 Follow-up: Privacy-Toggle fuer Community-Mitglieder.
-- Wenn aktiv, sehen andere Community-Members im Leaderboard 'Anonym' statt
-- des echten Namens. Eigener Eintrag bleibt fuer den Owner sichtbar.
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS community_anonym BOOLEAN NOT NULL DEFAULT false;
