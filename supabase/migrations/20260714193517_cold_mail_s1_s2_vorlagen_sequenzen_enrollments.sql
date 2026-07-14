-- Cold-Mailer S1+S2: Vorlagen, Sequenzen, Steps, Enrollments.
-- Additiv. Alle staff-only (is_staff()); der CRON-Advancer laeuft ueber den Service-Client.

create table if not exists public.cold_mail_vorlagen (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rolle text check (rolle in ('makler','werkstatt','sachverstaendiger')), -- NULL = alle Rollen
  betreff text not null,
  body_html text not null,
  erstellt_von uuid references auth.users(id) on delete set null,
  erstellt_am timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
alter table public.cold_mail_vorlagen enable row level security;
create policy cmv_staff_all on public.cold_mail_vorlagen
  for all using (public.is_staff()) with check (public.is_staff());

create table if not exists public.cold_mail_sequenzen (
  id uuid primary key default gen_random_uuid(),
  rolle text not null check (rolle in ('makler','werkstatt','sachverstaendiger')),
  name text not null,
  aktiv boolean not null default false,
  auto_enroll boolean not null default false,
  erstellt_am timestamptz not null default now()
);
alter table public.cold_mail_sequenzen enable row level security;
create policy cms_seq_staff_all on public.cold_mail_sequenzen
  for all using (public.is_staff()) with check (public.is_staff());
-- Hoechstens EINE auto-enrollende Aktiv-Sequenz je Rolle (sonst landet ein
-- gescrapter Lead in mehreren Sequenzen gleichzeitig).
create unique index if not exists cms_seq_one_autoenroll_per_rolle
  on public.cold_mail_sequenzen(rolle) where (aktiv and auto_enroll);

create table if not exists public.cold_mail_steps (
  id uuid primary key default gen_random_uuid(),
  sequenz_id uuid not null references public.cold_mail_sequenzen(id) on delete cascade,
  position int not null,
  vorlage_id uuid not null references public.cold_mail_vorlagen(id) on delete restrict,
  delay_tage int not null default 0 check (delay_tage >= 0),
  bedingung text not null default 'immer'
    check (bedingung in ('immer','wenn_nicht_geoeffnet','wenn_geoeffnet','wenn_keine_antwort')),
  unique (sequenz_id, position)
);
alter table public.cold_mail_steps enable row level security;
create policy cms_steps_staff_all on public.cold_mail_steps
  for all using (public.is_staff()) with check (public.is_staff());

create table if not exists public.cold_mail_enrollments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.partner_leads(id) on delete cascade,
  sequenz_id uuid not null references public.cold_mail_sequenzen(id) on delete cascade,
  aktueller_step int not null default 0,
  status text not null default 'aktiv'
    check (status in ('aktiv','pausiert','fertig','opt_out','bounced','geantwortet')),
  next_send_at timestamptz,
  erstellt_am timestamptz not null default now(),
  unique (lead_id, sequenz_id)
);
alter table public.cold_mail_enrollments enable row level security;
create policy cms_enr_staff_all on public.cold_mail_enrollments
  for all using (public.is_staff()) with check (public.is_staff());
-- Der CRON-Advancer sucht faellige Enrollments -> gezielter Index.
create index if not exists cms_enr_faellig_idx
  on public.cold_mail_enrollments(next_send_at) where (status = 'aktiv');

-- S0 hat diese 3 Spalten bewusst OHNE FK angelegt (Zieltabellen existierten noch nicht).
-- Jetzt nachziehen; die Tabelle ist leer, also ist das gefahrlos.
alter table public.cold_mail_sends
  add constraint cold_mail_sends_enrollment_id_fkey
  foreign key (enrollment_id) references public.cold_mail_enrollments(id) on delete set null;
alter table public.cold_mail_sends
  add constraint cold_mail_sends_step_id_fkey
  foreign key (step_id) references public.cold_mail_steps(id) on delete set null;
alter table public.cold_mail_sends
  add constraint cold_mail_sends_vorlage_id_fkey
  foreign key (vorlage_id) references public.cold_mail_vorlagen(id) on delete set null;
