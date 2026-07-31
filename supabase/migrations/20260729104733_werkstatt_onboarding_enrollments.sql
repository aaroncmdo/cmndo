-- Werkstatt-Onboarding-Drip: Fortschritt je Werkstatt (Enrollment/Timer).
-- Spec: docs/superpowers/specs/2026-07-29-werkstatt-onboarding-drip-design.md §4.2
create table public.werkstatt_onboarding_enrollments (
  id uuid primary key default gen_random_uuid(),
  werkstatt_id uuid not null unique references public.werkstaetten(id) on delete cascade,
  aktueller_step int not null default 0,
  next_send_at timestamptz,
  status text not null default 'aktiv' check (status = any (array[
    'aktiv','aktiviert','gestoppt','fertig'])),
  erstellt_am timestamptz not null default now()
);
alter table public.werkstatt_onboarding_enrollments enable row level security;
create index werkstatt_onboarding_enr_due_idx
  on public.werkstatt_onboarding_enrollments (next_send_at)
  where status = 'aktiv';
grant select on public.werkstatt_onboarding_enrollments to authenticated;
create policy werkstatt_onboarding_enr_staff_ro on public.werkstatt_onboarding_enrollments
  for select to authenticated using (is_staff());
