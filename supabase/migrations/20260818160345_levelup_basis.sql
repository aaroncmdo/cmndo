-- SV-LevelUp — Basistabellen
--
-- Sieben Tabellen fuer den Sichtbarkeits-Check. RLS ist von Anfang an
-- geschlossen: Lesen nur fuer Vertriebsrollen, Schreiben ausschliesslich ueber
-- service_role in Server Actions. Keine anon-Policy, nirgends.
--
-- levelup_funnel und levelup_events bekommen bewusst GAR KEINE Lese-Policy —
-- der Zugriff laeuft dort nur ueber service_role (Design-Spec §6, CONTEXT §3.4).
--
-- Spec: docs/superpowers/specs/2026-08-18-sv-levelup-design.md
-- Plan: docs/superpowers/plans/2026-08-18-sv-levelup-p1-fundament.md (Task 1)

create table public.levelup_checks (
  id                    uuid primary key default gen_random_uuid(),
  token                 text not null unique,
  sv_lead_id            uuid references public.sv_leads(id) on delete set null,
  modus                 text not null check (modus in ('aufbau','bestand')),
  website_url           text,
  standort_ort          text,
  standort_plz          text,
  standort_lat          double precision,
  standort_lng          double precision,
  radius_wettbewerb_km  smallint not null default 50,
  radius_keywords_km    smallint not null default 20,
  module_gewaehlt       text[] not null default '{}',
  module_gewuenscht     text[] not null default '{}',
  status                text not null default 'neu'
                        check (status in ('neu','laeuft','fertig','fehler','abgelaufen')),
  score                 smallint,
  kein_score            boolean not null default false,
  punkte_erhebbar       smallint,
  befunde               jsonb not null default '{}',
  massnahmen            jsonb not null default '[]',
  fehlstellen           jsonb not null default '[]',
  zuweiser_treffer      jsonb not null default '[]',
  gsc_property          text,
  gsc_freigabe_am       timestamptz,
  erhoben_am            timestamptz,
  fehler_text           text,
  quelle                text not null default 'sv-levelup.claimondo.de',
  ip_hash               text,
  user_agent            text,
  erstellt_am           timestamptz not null default now(),
  aktualisiert_am       timestamptz not null default now(),
  gueltig_bis           timestamptz not null default now() + interval '90 days'
);
comment on column public.levelup_checks.module_gewuenscht is
  'Wunsch des Nutzers, getrennt vom Messbaren. Wer eine URL nachtraegt, bekommt das Modul zurueck (T-02).';
comment on column public.levelup_checks.massnahmen is
  'Bleibt leer bis F-09. Regel R-E: im Zustand fertig nie ausliefern.';

create index levelup_checks_status_idx on public.levelup_checks (status, erstellt_am desc);
create index levelup_checks_lead_idx   on public.levelup_checks (sv_lead_id);

create table public.levelup_funnel (
  check_id           uuid primary key references public.levelup_checks(id) on delete cascade,
  jahre_erfahrung    text check (jahre_erfahrung in ('start','unter2','2bis10','ueber10')),
  ki_nutzung         text check (ki_nutzung in ('taeglich','gelegentlich','nein','unklar')),
  marketing_partner  text check (marketing_partner in ('agentur','nebenbei','selbst','niemand')),
  beantwortet_am     timestamptz not null default now()
);

create table public.levelup_termine (
  id            uuid primary key default gen_random_uuid(),
  check_id      uuid not null references public.levelup_checks(id) on delete cascade,
  slot_start    timestamptz not null,
  telefon       text not null,
  status        text not null default 'gewuenscht'
                check (status in ('gewuenscht','bestaetigt','stattgefunden','abgesagt','nicht_erschienen')),
  betreuer_id   uuid references public.profiles(id),
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index levelup_termine_check_idx on public.levelup_termine (check_id);

create table public.levelup_events (
  id          bigserial primary key,
  check_id    uuid references public.levelup_checks(id) on delete cascade,
  typ         text not null,
  payload     jsonb not null default '{}',
  ts          timestamptz not null default now()
);
create index levelup_events_check_idx on public.levelup_events (check_id, ts);

create table public.levelup_praesentationen (
  id             uuid primary key default gen_random_uuid(),
  check_id       uuid not null references public.levelup_checks(id) on delete cascade,
  token          text not null unique,
  erstellt_von   uuid not null references public.profiles(id),
  gueltig_bis    timestamptz not null default now() + interval '30 days',
  widerrufen_am  timestamptz,
  aufrufe        integer not null default 0,
  letzter_aufruf timestamptz,
  erstellt_am    timestamptz not null default now()
);
create index levelup_praes_check_idx on public.levelup_praesentationen (check_id);

create table public.levelup_auswertungslinks (
  id             uuid primary key default gen_random_uuid(),
  check_id       uuid not null references public.levelup_checks(id) on delete cascade,
  token          text not null unique,
  erstellt_von   uuid references public.profiles(id),
  erstellt_am    timestamptz not null default now(),
  letzter_aufruf timestamptz,
  aufrufe        integer not null default 0
);
create index levelup_ausw_check_idx on public.levelup_auswertungslinks (check_id);

create table public.levelup_anreicherung (
  id            bigserial primary key,
  sv_lead_id    uuid not null references public.sv_leads(id) on delete cascade,
  feld          text not null,
  wert_vorher   text,
  wert_nachher  text,
  quelle_url    text not null,
  sicherheit    smallint not null,
  lauf_id       uuid not null,
  ts            timestamptz not null default now()
);
create index levelup_anreicherung_lead_idx on public.levelup_anreicherung (sv_lead_id, ts desc);
create index levelup_anreicherung_lauf_idx on public.levelup_anreicherung (lauf_id);

alter table public.levelup_checks            enable row level security;
alter table public.levelup_funnel            enable row level security;
alter table public.levelup_termine           enable row level security;
alter table public.levelup_events            enable row level security;
alter table public.levelup_praesentationen   enable row level security;
alter table public.levelup_auswertungslinks  enable row level security;
alter table public.levelup_anreicherung      enable row level security;

-- Lesen: Vertriebsrollen. leadbearbeiter ist NICHT in is_staff() enthalten
-- (geprueft 18.08.2026) und wird deshalb ausgeschrieben.
-- Jede Policy hat ein explizites TO — ohne das waere sie PUBLIC und damit
-- auch fuer anon wirksam (RLS-Policy-Ratchet).
create policy levelup_checks_vertrieb_sel on public.levelup_checks for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())
                 and p.rolle in ('admin','dispatch','leadbearbeiter','kundenbetreuer')));
create policy levelup_checks_vertrieb_upd on public.levelup_checks for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())
                 and p.rolle in ('admin','dispatch','leadbearbeiter')));

create policy levelup_termine_vertrieb_sel on public.levelup_termine for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())
                 and p.rolle in ('admin','dispatch','leadbearbeiter','kundenbetreuer')));
create policy levelup_termine_vertrieb_upd on public.levelup_termine for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())
                 and p.rolle in ('admin','dispatch','leadbearbeiter')));

create policy levelup_praes_staff_sel on public.levelup_praesentationen for select to authenticated
  using (public.is_staff());
create policy levelup_ausw_staff_sel on public.levelup_auswertungslinks for select to authenticated
  using (public.is_staff());
create policy levelup_anreicherung_staff_sel on public.levelup_anreicherung for select to authenticated
  using (public.is_staff());
