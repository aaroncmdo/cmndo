-- P1 fix: re-seed the deleted RLS-audit fixture users (stable UUIDs bbbb1111 kanzlei, bbbb2222 makler).
-- A test-data cleanup deleted these audit fixtures post-18:00 (2026-07-13) -> audit_claim_view_identity
-- reported kanzlei UNTER-Exposure (the fixture lost profiles.rolle='kanzlei', so the gate correctly
-- denied) -> check-claim-view-rls guard red -> ALL SQL releases blocked. The gate function
-- claim_sichtbar_fuer_aktuellen_user is INTACT; real kanzlei users are unaffected (1 real kanzlei
-- verified). This restores the audit fixtures (idempotent). Fixtures referenced by the audit RPC
-- migration 20260629170133_claim_view_identity_alle_8_rollen.

insert into auth.users
  (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('bbbb1111-0000-4000-8000-000000000010','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'test-kanzlei@claimondo.de', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('bbbb2222-0000-4000-8000-000000000020','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'test-makler@claimondo.de', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.profiles
  (id, email, rolle, anzeigename, twofa_aktiviert, twofa_email_aktiviert, force_password_change)
values
  ('bbbb1111-0000-4000-8000-000000000010','test-kanzlei@claimondo.de','kanzlei','Test Kanzlei', false, false, false),
  ('bbbb2222-0000-4000-8000-000000000020','test-makler@claimondo.de','makler','Test Makler', false, false, false)
on conflict (id) do update set rolle = excluded.rolle, email = excluded.email;
