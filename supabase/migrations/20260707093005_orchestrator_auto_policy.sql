-- Phase 2 (Auto-Graduierung): per-(typ,rolle) Auto-Policy + Audit-Spalten.
-- Safe-by-default: keine Zeile = manual. Auto passiert erst wenn ein Admin
-- bewusst flippt UND der globale Kill-Switch (ENV ORCHESTRATOR_AUTO_ENABLED) an ist.
-- RLS an + kein anon/authenticated-Grant -> nur service_role (Admin-Panel liest/schreibt
-- via createAdminClient nach requireAdmin-Guard).
create table public.orchestrator_auto_policy (
  id uuid primary key default gen_random_uuid(),
  vorschlag_typ text not null,
  ziel_rolle text not null,
  mode text not null default 'manual' check (mode in ('manual','auto')),
  geflippt_von uuid references auth.users(id),
  geflippt_am timestamptz,
  auto_revert_grund text,
  aktualisiert_am timestamptz not null default now(),
  unique (vorschlag_typ, ziel_rolle)
);
alter table public.orchestrator_auto_policy enable row level security;
revoke all on public.orchestrator_auto_policy from anon, authenticated;

-- ai_claim_proposals: Auto-Ausfuehrung nachvollziehbar machen (Regressions-Monitor
-- findet Auto-Tasks via erzeugte_task_id, auto_ausgefuehrt=true).
alter table public.ai_claim_proposals add column if not exists auto_ausgefuehrt boolean not null default false;
alter table public.ai_claim_proposals add column if not exists erzeugte_task_id uuid;
