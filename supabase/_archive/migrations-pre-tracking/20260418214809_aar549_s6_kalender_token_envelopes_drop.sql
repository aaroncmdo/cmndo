ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS google_calendar_token;
ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS outlook_calendar_token;

COMMENT ON COLUMN sachverstaendige.gcal_access_token IS
  'Google OAuth Access-Token. Kanonische Quelle seit AAR-549 S6 (ersetzt google_calendar_token). Wird via /api/auth/google-calendar/callback befüllt.';

COMMENT ON COLUMN sachverstaendige.gcal_refresh_token IS
  'Google OAuth Refresh-Token. Gepaart mit gcal_access_token + gcal_token_expiry.';;
