-- KFZ-6: Add new fall status values for 13-column dispatch pipeline
-- New statuses: besichtigung (D-03), qc-pruefung (E-Akte check)
-- Also add regulierung_am timestamp if not exists for VS-Timer

ALTER TABLE faelle ADD COLUMN IF NOT EXISTS regulierung_am timestamptz;

-- Add status_changed_at to track when a case entered its current status (for days-in-status)
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS status_changed_at timestamptz DEFAULT now();
