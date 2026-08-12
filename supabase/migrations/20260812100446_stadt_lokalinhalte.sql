-- Hyperlokale Ortsinhalte je Stadt-Page (/kfz-gutachter/[stadt]).
-- Spiegelt die Struktur von HyperLocal/SpokeLocal aus dem Marketing-Build
-- (claimondo-marketing/lib/kfz-gutachter/staedte.ts), damit generierte Inhalte
-- die BESTEHENDEN Sektionen fuellen statt neuer UI.
--
-- Ablauf wie bei wissen_artikel: KI erzeugt Entwurf -> status 'in_review' ->
-- Mensch prueft im Admin -> 'veroeffentlicht'. KEIN Auto-Publish.
--
-- RLS: aktiviert OHNE Policies = nur service_role kommt ran. Sowohl die
-- Admin-Actions (createAdminClient) als auch der Marketing-Read laufen
-- server-seitig mit service_role. anon/authenticated brauchen keinen Zugriff,
-- also bekommen sie auch keinen (Default-Privileges, #4555).
create table public.stadt_lokalinhalte (
  id uuid primary key default gen_random_uuid(),

  -- Slug der Stadt aus STAEDTE (kein FK moeglich: die Staedte-Liste lebt im Code)
  stadt_slug text not null,

  status text not null default 'entwurf',

  -- Inhalt. jsonb, weil die Formen 1:1 den TS-Typen entsprechen:
  --   stadtbezirke    [{ name, ortsteile: [] }]
  --   hauptachsen     { autobahnen: [], bundesstrassen: [], knoten: [] }
  --   unfall_hotspots [{ ort, beschreibung, quelle, einzelfall }]  <- quelle PFLICHT
  --   lokale_faqs     [{ frage, antwort }]
  stadtbezirke jsonb not null default '[]'::jsonb,
  hauptachsen jsonb not null default '{}'::jsonb,
  unfall_hotspots jsonb not null default '[]'::jsonb,
  lokale_faqs jsonb not null default '[]'::jsonb,
  hero_anker text,
  topografie_anker text,

  -- Gate (Spec §4.1, Aaron-Entscheid 12.08.2026): >= 3 harte, extern
  -- verifizierbare Ortsfakten. Die Eigendaten-Pflicht ist gestrichen, weil sie
  -- gemessen nur ~6 von 92 Staedten erfuellt haetten.
  substanz_score integer not null default 0,

  -- Provenienz
  ai_generated boolean not null default true,
  ai_model text,
  reviewed_von uuid,
  reviewed_am timestamptz,
  veroeffentlicht_am timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint stadt_lokalinhalte_status_check
    check (status = any (array['entwurf','in_review','veroeffentlicht','abgelehnt','archiviert'])),
  constraint stadt_lokalinhalte_slug_check
    check (stadt_slug ~ '^[a-z0-9-]{2,80}$'),
  constraint stadt_lokalinhalte_score_check
    check (substanz_score >= 0)
);

-- Pro Stadt darf hoechstens EIN Datensatz veroeffentlicht sein. Entwuerfe einer
-- neuen Fassung duerfen daneben liegen, waehrend die alte live bleibt.
create unique index stadt_lokalinhalte_ein_veroeffentlichter
  on public.stadt_lokalinhalte (stadt_slug)
  where status = 'veroeffentlicht';

-- Der Marketing-Read fragt genau nach (stadt_slug, status='veroeffentlicht').
create index stadt_lokalinhalte_slug_status_idx
  on public.stadt_lokalinhalte (stadt_slug, status);

alter table public.stadt_lokalinhalte enable row level security;

comment on table public.stadt_lokalinhalte is
  'Hyperlokale Ortsinhalte je Stadt-Page. KI-Entwurf -> Admin-Review -> veroeffentlicht. Kein Auto-Publish. Nur service_role (RLS ohne Policies).';
comment on column public.stadt_lokalinhalte.unfall_hotspots is
  'Jeder Hotspot MUSS eine belegbare Quell-URL tragen (Aaron-Entscheid 12.08.2026). Ohne Quelle wird der Eintrag beim Gate verworfen.';
