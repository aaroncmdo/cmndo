-- SP1 Fundament: universelle profil-gekeyte Kalender-Verbindungen + Cache-profile_id.
-- Additiv, kein Drop. Google bleibt auf profiles.google_*. sv_kalender_verbindungen
-- bleibt vorerst als Sicherheitsnetz (Retire = separater Cleanup nach Verifikation).

create table if not exists kalender_verbindungen (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  provider text not null check (provider in ('caldav')),
  server_url text,
  username text,
  password_encrypted text,
  calendar_url text,
  last_error text,
  last_error_at timestamptz,
  erstellt_am timestamptz not null default now(),
  unique (profile_id, provider)
);
create index if not exists idx_kalender_verbindungen_profile on kalender_verbindungen(profile_id);

insert into kalender_verbindungen (profile_id, provider, server_url, username, password_encrypted, calendar_url, last_error, last_error_at)
select s.profile_id, v.provider, v.server_url, v.username, v.password_encrypted, v.calendar_url, v.last_error, v.last_error_at
from sv_kalender_verbindungen v
join sachverstaendige s on s.id = v.sv_id
where v.provider = 'caldav' and s.profile_id is not null
on conflict (profile_id, provider) do nothing;

alter table sv_kalender_events_cache add column if not exists profile_id uuid;
update sv_kalender_events_cache c set profile_id = s.profile_id
from sachverstaendige s where s.id = c.sv_id and c.profile_id is null;
create index if not exists idx_sv_kalender_events_cache_profile on sv_kalender_events_cache(profile_id);
