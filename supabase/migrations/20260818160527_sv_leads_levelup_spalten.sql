-- SV-LevelUp — zehn additive Spalten auf sv_leads
--
-- Alle nullable und ohne Default: kein Tabellen-Rewrite, kein langer Lock.
-- sv_leads enthaelt 62 echte Vertriebsdatensaetze, deshalb eine eigene
-- Migration mit eindeutiger Zeilenzahl-Gegenprobe (62 vorher == 62 nachher).
--
-- google_place_id ist der haerteste Dedup-Schluessel fuer die Discovery
-- (Design-Spec §5.5.2): stabil, waehrend Firmennamen variieren. Der Index ist
-- partiell, damit die 62 Bestandszeilen ohne place_id nicht kollidieren.
--
-- Spec: docs/superpowers/specs/2026-08-18-sv-levelup-design.md §6
-- Plan: docs/superpowers/plans/2026-08-18-sv-levelup-p1-fundament.md (Task 2)

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
