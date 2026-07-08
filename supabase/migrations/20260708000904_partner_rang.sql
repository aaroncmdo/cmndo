create table if not exists public.partner_rang (
  id uuid primary key default gen_random_uuid(),
  partner_typ text not null check (partner_typ in ('sachverstaendiger','makler','werkstatt')),
  partner_id uuid not null,
  volumen integer not null default 0,
  score numeric not null default 0,
  credential_score numeric not null default 0,
  rating_score numeric not null default 0,
  gate_ok boolean not null default false,
  gate_cap text check (gate_cap in ('bronze','silber','gold')),
  rang text check (rang in ('bronze','silber','gold')),
  sinnsatz text,
  stand timestamptz not null default now(),
  unique (partner_typ, partner_id)
);

alter table public.partner_rang enable row level security;

-- Der Rang IST ein oeffentlicher Badge: jeder (inkl. anon) darf gate-konforme Raenge lesen.
create policy "partner_rang_public_read" on public.partner_rang
  for select using (gate_ok = true and rang is not null);

-- Kein Write-Policy => INSERT/UPDATE/DELETE nur ueber service-role (Cron, bypasst RLS).

comment on table public.partner_rang is 'Berechneter Partner-Tier-Rang (Bronze/Silber/Gold) je Partner. Befuellt vom Cron compute-partner-rang. Spec 2026-07-08-partner-tier-badge.';
