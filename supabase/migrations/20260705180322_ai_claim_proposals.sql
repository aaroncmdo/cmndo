-- AI-Claim-Orchestrator (Phase-1-PoC): Shadow-Mode-Vorschlaege.
-- Der Cron-Reviewer schreibt hier Vorschlaege (mit Begruendung + Modellversion);
-- ein Admin nimmt sie an/verwirft sie. Kein Auto-Write am Fall.
-- RLS an + kein anon/authenticated-Grant -> nur service_role (Admin-Surface liest
-- via createAdminClient nach requireAdmin-Guard). Partial-Unique-Index = Idempotenz.
create table public.ai_claim_proposals (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  erstellt_am timestamptz not null default now(),
  vorschlag_typ text not null check (vorschlag_typ in ('task','escalation','next_step')),
  ziel_rolle text check (ziel_rolle in ('sachverstaendiger','kundenbetreuer','admin')),
  payload jsonb not null default '{}'::jsonb,
  begruendung text not null,
  modell text not null,
  dedupe_key text not null,
  status text not null default 'offen' check (status in ('offen','angenommen','verworfen','bearbeitet')),
  entschieden_von uuid references auth.users(id),
  entschieden_am timestamptz,
  feedback text
);
create index ai_claim_proposals_claim_idx on public.ai_claim_proposals(claim_id);
create unique index ai_claim_proposals_dedupe_open_idx
  on public.ai_claim_proposals(dedupe_key) where status = 'offen';
alter table public.ai_claim_proposals enable row level security;
revoke all on public.ai_claim_proposals from anon, authenticated;
