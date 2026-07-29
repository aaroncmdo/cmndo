-- Werkstatt-Onboarding-Aktivierungs-Drip: die DB-editierbare Sequenz (Timing + Copy).
-- Spec: docs/superpowers/specs/2026-07-29-werkstatt-onboarding-drip-design.md §4.1
create table public.werkstatt_onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  position int not null unique check (position > 0),
  offset_tage int not null check (offset_tage >= 0),
  template_key text not null check (template_key = any (array[
    'willkommen','nutzen','sv_vorstellung','kundenstory','bonus','reaktivierung'])),
  betreff text not null,
  preheader text not null default '',
  copy jsonb not null default '{}'::jsonb,
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
alter table public.werkstatt_onboarding_steps enable row level security;
grant select, update on public.werkstatt_onboarding_steps to authenticated;
create policy werkstatt_onboarding_steps_staff_ro on public.werkstatt_onboarding_steps
  for select to authenticated using (is_staff());
create policy werkstatt_onboarding_steps_staff_upd on public.werkstatt_onboarding_steps
  for update to authenticated using (is_staff()) with check (is_staff());
