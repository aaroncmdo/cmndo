-- KFZ-210: Nachbesichtigung als eigener Fall-Status (Soft-Blocker)
ALTER TYPE fall_status ADD VALUE IF NOT EXISTS 'nachbesichtigung-laeuft' AFTER 'regulierung-laeuft';
