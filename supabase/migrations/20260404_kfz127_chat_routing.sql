-- KFZ-127: Chat-Routing — empfaenger_id fuer gezielte Zustellung
ALTER TABLE nachrichten ADD COLUMN IF NOT EXISTS empfaenger_id UUID REFERENCES auth.users(id);
