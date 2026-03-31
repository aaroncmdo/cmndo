-- KFZ-84: Google Calendar OAuth
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS gcal_access_token TEXT;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS gcal_refresh_token TEXT;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS gcal_token_expiry TIMESTAMPTZ;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS gcal_connected BOOLEAN DEFAULT false;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS gcal_calendar_id TEXT DEFAULT 'primary';
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS gcal_event_id TEXT;
