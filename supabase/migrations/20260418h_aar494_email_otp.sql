-- AAR-494: Email-OTP als alternative 2FA-Methode.
--
-- Bisher: nur SMS-Code via Twilio Verify (KFZ-184).
-- Neu: Email-OTP parallel, Nutzer kann im 2FA-Step zwischen Telefon und Email
-- wählen, wenn beide konfiguriert sind. Rate-Limit: 3 Codes pro Stunde.
--
-- Tabelle: email_otp_codes
--   code_hash = sha256(6-stelliger Code) — kein Klartext in DB
--   expires_at = created_at + 5 Min
--   verifiziert_am = gesetzt bei erfolgreichem Verify (one-shot)
--
-- Rate-Limit wird in der Server-Action ausgewertet: count(*) where user_id=? and
-- created_at > now() - interval '1 hour'.

create table if not exists email_otp_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  verifiziert_am timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_otp_codes_user_created_idx
  on email_otp_codes (user_id, created_at desc);

create index if not exists email_otp_codes_user_unverified_idx
  on email_otp_codes (user_id, expires_at)
  where verifiziert_am is null;

alter table email_otp_codes enable row level security;

-- Service-Role-Only. Kein direkter Client-Zugriff — alle Writes/Reads laufen
-- über Server-Actions mit createAdminClient().
create policy "email_otp_codes_service_role"
  on email_otp_codes
  for all
  to service_role
  using (true)
  with check (true);

-- Profil-Flag: Email-2FA aktiviert? Default false — wird beim Setup in
-- /einstellungen/sicherheit auf true gesetzt.
alter table profiles
  add column if not exists twofa_email_aktiviert boolean not null default false;

alter table profiles
  add column if not exists twofa_email_verifiziert_am timestamptz;

comment on table email_otp_codes is
  'AAR-494: 6-stellige OTP-Codes für Email-2FA. Hash-only, 5 Min TTL, 3/h Rate-Limit.';
comment on column profiles.twofa_email_aktiviert is
  'AAR-494: True, wenn der Nutzer Email-2FA als Methode gewählt hat.';
