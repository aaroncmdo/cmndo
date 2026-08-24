alter table public.sv_leads
  add column levelup_letzter_check_id uuid references public.levelup_checks(id) on delete set null,
  add column levelup_letzter_score    smallint,
  add column website_url              text,
  add column website_gefunden         text,
  add column website_sicherheit       smallint,
  add column kontakt_quelle           text,
  add column angereichert_am          timestamptz,
  add column google_place_id          text,
  add column entdeckt_am              timestamptz,
  add column entdeckt_lauf            uuid;

create unique index sv_leads_google_place_id_uidx
  on public.sv_leads (google_place_id) where google_place_id is not null;

comment on column public.sv_leads.levelup_letzter_check_id is
  'Denormalisiert fuer die Vertriebsliste. Wahrheit steht in levelup_checks.';
comment on column public.sv_leads.website_sicherheit is
  'Unter 70 gilt die Zuordnung als unsicher. Der Vertrieb sieht das als Warnung in der Liste.';
comment on column public.sv_leads.google_place_id is
  'Haertester Dedup-Schluessel der Discovery. Stabil, waehrend Namen variieren.';
