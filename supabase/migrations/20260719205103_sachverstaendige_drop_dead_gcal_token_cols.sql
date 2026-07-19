-- Boy-Scout Leak-Fix: die 3 toten gcal-Token-Spalten aus sachverstaendige droppen.
-- Dormant (0 befuellt) + laut google-calendar callback/disconnect-Kommentaren "werden NICHT
-- mehr beschrieben" (die Kalender-OAuth-Tokens leben jetzt in profiles_oauth_secrets). Sie waren
-- authenticated-lesbar (Staff-Leak-Klasse wie profiles.*_token, nur dormant). DROP statt
-- column-cap: sachverstaendige ist in supabase_realtime -> ein Grant-Revoke/column-cap koennte
-- walrus CDC brechen (claims-Regression-Lesson), ein Column-DROP ist bei table-level-Publication
-- neutral. gcal_connected (aktives UI-Flag) + gcal_calendar_id bleiben.
set local lock_timeout = '5s';
alter table public.sachverstaendige
  drop column if exists gcal_access_token,
  drop column if exists gcal_refresh_token,
  drop column if exists gcal_token_expiry;
