-- SV-Werkstatt-Empfehlung (Option 1: empfehlen 1-3 -> Kunde waehlt per Magic-Link).
-- Claim-anchored (faelle ist prod-seitig gedroppt, CMM-49). Service-role-only:
-- Zugriff ausschliesslich ueber Server-Actions mit dem Admin-Client.
create table public.werkstatt_empfehlung_batches (
  id                     uuid primary key default gen_random_uuid(),
  claim_id               uuid not null references public.claims(id) on delete cascade,
  empfohlen_von          uuid not null,
  token                  text not null unique,
  status                 text not null default 'offen'
                         check (status in ('offen','entschieden','zurueckgezogen','abgelaufen')),
  gewaehlte_werkstatt_id uuid references public.werkstaetten(id),
  expires_at             timestamptz not null,
  entschieden_am         timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index werkstatt_empfehlung_batches_claim_idx on public.werkstatt_empfehlung_batches (claim_id);

create table public.werkstatt_empfehlungen (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references public.werkstatt_empfehlung_batches(id) on delete cascade,
  werkstatt_id   uuid not null references public.werkstaetten(id),
  rang           smallint not null default 1,
  distanz_km     numeric,
  match_snapshot jsonb,
  created_at     timestamptz not null default now()
);
create index werkstatt_empfehlungen_batch_idx on public.werkstatt_empfehlungen (batch_id);

-- Service-role-only (Wurzel-Regel anon-Grants): kein direkter anon/authenticated-Zugriff.
revoke all on public.werkstatt_empfehlung_batches from anon, authenticated;
revoke all on public.werkstatt_empfehlungen from anon, authenticated;
alter table public.werkstatt_empfehlung_batches enable row level security;
alter table public.werkstatt_empfehlungen enable row level security;
comment on table public.werkstatt_empfehlung_batches is 'SV-Werkstatt-Empfehlung (1-3, Magic-Link). Service-Role-only, Zugriff nur via Server-Actions.';
comment on table public.werkstatt_empfehlungen is 'Kandidaten eines Empfehlungs-Batches + Match-Snapshot. Service-Role-only.';
