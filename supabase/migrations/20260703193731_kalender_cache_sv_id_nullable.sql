-- SP1 IN-Sync: KB/Nicht-SV-Cache-Rows haben kein sv_id. sv_id nullable machen
-- (der alte SV-Cron setzt sv_id weiter → unberührt; die (sv_id,source,external_event_id)-Unique
-- bleibt für ihn bestehen). Der neue profil-gekeyte Cron nutzt profile_id + Plain-Insert.
alter table sv_kalender_events_cache alter column sv_id drop not null;
