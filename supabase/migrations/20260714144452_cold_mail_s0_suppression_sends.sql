-- Cold-Mailer S0: Suppression-Liste + Sende-Verlauf (SSoT).
create table if not exists public.cold_mail_suppression (
  email text primary key,
  grund text not null check (grund in ('opt_out','bounce','beschwerde')),
  lead_id uuid references public.partner_leads(id) on delete set null,
  erstellt_am timestamptz not null default now()
);
alter table public.cold_mail_suppression enable row level security;
create policy cms_supp_staff_all on public.cold_mail_suppression
  for all using (public.is_staff()) with check (public.is_staff());

create table if not exists public.cold_mail_sends (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.partner_leads(id) on delete cascade,
  enrollment_id uuid,   -- FK -> cold_mail_enrollments (S2)
  step_id uuid,         -- FK -> cold_mail_steps (S2)
  vorlage_id uuid,      -- FK -> cold_mail_vorlagen (S1)
  empfaenger_email text not null,
  betreff text not null,
  body_snapshot text,
  resend_message_id text,
  status text not null default 'gesendet'
    check (status in ('gesendet','zugestellt','geoeffnet','geklickt','bounced','beschwerde')),
  gesendet_am timestamptz not null default now(),
  geoeffnet_am timestamptz,
  geklickt_am timestamptz
);
create index if not exists cms_sends_lead_idx on public.cold_mail_sends(lead_id);
create index if not exists cms_sends_msgid_idx on public.cold_mail_sends(resend_message_id);
alter table public.cold_mail_sends enable row level security;
create policy cms_sends_staff_all on public.cold_mail_sends
  for all using (public.is_staff()) with check (public.is_staff());
