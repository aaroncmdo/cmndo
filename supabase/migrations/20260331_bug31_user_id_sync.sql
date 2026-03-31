-- BUG-31: user_id Spalte + Sync mit profile_id
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS user_id UUID;
UPDATE sachverstaendige SET user_id = profile_id WHERE user_id IS NULL AND profile_id IS NOT NULL;
