create table public.gewinnspiel_kampagnen (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_am date not null,
  ende_am date,
  preise_pro_tag integer not null default 3 check (preise_pro_tag between 1 and 20),
  preis_betrag_eur numeric(10,2) not null default 50.00,
  topbar_text text,
  topbar_cta_text text,
  topbar_aktiv boolean not null default false,
  aktiv boolean not null default false,
  erstellt_am timestamptz not null default now()
);
comment on table public.gewinnspiel_kampagnen is
  'Gewinnspiel-Kampagne. Genau eine Zeile darf aktiv sein (Unique-Index unten).';

-- Nur EINE aktive Kampagne: die Kampagnen-API und der Lostopf gehen von
-- Eindeutigkeit aus. Ohne diesen Index waere "die aktive Kampagne" mehrdeutig.
create unique index gewinnspiel_kampagnen_eine_aktive
  on public.gewinnspiel_kampagnen ((true)) where aktiv;

create table public.gewinnspiel_praemien (
  id uuid primary key default gen_random_uuid(),
  kampagne_id uuid not null references public.gewinnspiel_kampagnen(id) on delete cascade,
  name text not null,
  beschreibung text,
  bild_pfad text,
  betrag_eur numeric(10,2) not null default 50.00,
  sortierung integer not null default 0,
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now()
);
comment on table public.gewinnspiel_praemien is
  'Katalog waehlbarer Gutschein-Arten je Kampagne. Der Teilnehmer waehlt daraus bereits bei der Teilnahme.';

create table public.gewinnspiel_teilnahmen (
  id uuid primary key default gen_random_uuid(),
  kampagne_id uuid not null references public.gewinnspiel_kampagnen(id) on delete cascade,
  anfrage_id uuid references public.gutachter_finder_anfragen(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  telefon_normalisiert text not null,
  whatsapp_gesendet_am timestamptz,
  whatsapp_verifiziert_am timestamptz,
  status text not null default 'offen'
    check (status in ('offen','gezogen','nachweis_offen','bestaetigt','abgelehnt')),
  gewaehlte_praemie_id uuid references public.gewinnspiel_praemien(id) on delete set null,
  gezogen_am timestamptz,
  gezogen_von_user_id uuid references auth.users(id) on delete set null,
  ziehung_lostopf_groesse integer,
  nachweis_token text unique,
  nachweis_datei_pfad text,
  nachweis_hochgeladen_am timestamptz,
  nachweis_geprueft_am timestamptz,
  nachweis_geprueft_von uuid references auth.users(id) on delete set null,
  ablehnung_grund text,
  gutschein_code text,
  gutschein_versendet_am timestamptz,
  erstellt_am timestamptz not null default now(),
  -- Genau eine Herkunft. Ohne das koennte eine Teilnahme an nichts oder an
  -- zwei Objekten haengen, und die Gewinner-Ansprache wuesste nicht, wen sie meint.
  constraint gewinnspiel_teilnahmen_genau_eine_quelle
    check ((anfrage_id is not null)::int + (lead_id is not null)::int = 1)
);
comment on table public.gewinnspiel_teilnahmen is
  'Eine Teilnahme je qualifizierendem Lead. Dedup ueber telefon_normalisiert je Kampagne.';

-- Eine Teilnahme pro Person und Kampagne. Der Dedup-Schluessel ist die
-- E.164-normalisierte Nummer, nicht die Rohform: '0175…' und '+49175…' sind
-- dieselbe Person und duerfen nicht zweimal im Lostopf liegen.
create unique index gewinnspiel_teilnahmen_eine_pro_person
  on public.gewinnspiel_teilnahmen (kampagne_id, telefon_normalisiert);

create index gewinnspiel_teilnahmen_lostopf
  on public.gewinnspiel_teilnahmen (kampagne_id, status, whatsapp_verifiziert_am);

-- RLS an, KEINE Policies: der Zugriff laeuft ausschliesslich ueber service-role
-- (Admin-Actions, Token-Route, Kampagnen-API). Muster: stadt_lokalinhalte.
-- Damit entsteht weder ein anon-Grant noch eine reachable Policy.
alter table public.gewinnspiel_kampagnen enable row level security;
alter table public.gewinnspiel_praemien enable row level security;
alter table public.gewinnspiel_teilnahmen enable row level security;
