-- SP5c: sv_kalender_events_cache.source um 'outlook' erweitern (IN-Sync Microsoft Graph).
alter table sv_kalender_events_cache drop constraint if exists sv_kalender_events_cache_source_check;
alter table sv_kalender_events_cache add constraint sv_kalender_events_cache_source_check
  check (source = any (array['google'::text, 'caldav'::text, 'outlook'::text]));
