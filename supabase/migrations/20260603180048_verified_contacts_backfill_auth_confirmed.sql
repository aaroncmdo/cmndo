-- §12-1b Backfill: proven-control aus auth.users-confirmed in verified_contacts.
-- Idempotent (unique(person_id,kind,value) + ON CONFLICT DO NOTHING). Liest auth.users via personen.user_id.
-- Live-Bestand 2026-06-03: 70 confirmed emails, 0 confirmed phones. Auf fresh-replay = 0 (auth.users leer).

insert into public.verified_contacts (person_id, kind, value, source, source_ref, verified_at)
select p.id, 'email', lower(btrim(u.email)), 'auth_email_confirmed', u.id::text, u.email_confirmed_at
from public.personen p
join auth.users u on u.id = p.user_id
where u.email is not null and btrim(u.email) <> '' and u.email_confirmed_at is not null
on conflict (person_id, kind, value) do nothing;

insert into public.verified_contacts (person_id, kind, value, source, source_ref, verified_at)
select p.id, 'phone', regexp_replace(btrim(u.phone), '\s+', '', 'g'), 'auth_phone_confirmed', u.id::text, u.phone_confirmed_at
from public.personen p
join auth.users u on u.id = p.user_id
where u.phone is not null and btrim(u.phone) <> '' and u.phone_confirmed_at is not null
on conflict (person_id, kind, value) do nothing;
