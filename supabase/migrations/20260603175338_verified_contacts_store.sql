-- Verified-Contact-Store (Identitaets-Engine §12-Schritt-1)
-- Proven-control Kontaktbelege (Email/Telefon) pro Person. Additiv, kein Consumer.
-- RLS deny-all-to-clients; Schreiben nur via record_verified_contact() + service_role.
-- Design: docs/superpowers/specs/2026-06-03-verified-contact-store-design.md

create table public.verified_contacts (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.personen(id) on delete cascade,
  kind        text not null check (kind in ('email','phone')),
  value       text not null,
  source      text not null check (source in
                ('auth_email_confirmed','auth_phone_confirmed','otp','magic_link','airdrop_accept')),
  source_ref  text,
  verified_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (person_id, kind, value)
);

create index verified_contacts_kind_value_idx
  on public.verified_contacts (kind, value);

comment on table public.verified_contacts is
  'Proven-control Kontaktbelege (Email/Telefon) pro personen-Zeile — Signal-Quelle der Identitaets-Engine (siehe docs/superpowers/specs/2026-06-03-identitaets-aufloesung-design.md §12-1). Harte Ebene ueber den weichen personen.email/telefon. RLS deny-all-to-clients; Schreiben nur via record_verified_contact(); Lesen via service_role/Definer.';
comment on column public.verified_contacts.value is 'normalisiert: email lower+trim; phone ohne Whitespace';
comment on column public.verified_contacts.source_ref is 'opaker Beleg-Verweis (auth-uid / airdrop_token / otp-id) fuer Provenance';

-- RLS: deny-all fuer PostgREST-Clients (kein person_id-Gate => §2-Invariante by-construction)
alter table public.verified_contacts enable row level security;
revoke all on table public.verified_contacts from anon, authenticated;
grant select, insert, update, delete on public.verified_contacts to service_role;

-- Schreib-Helper: einziger Schreibpfad, normalisiert + validiert + upsert
create or replace function public.record_verified_contact(
  p_person_id   uuid,
  p_kind        text,
  p_value       text,
  p_source      text,
  p_source_ref  text default null,
  p_verified_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value text;
  v_id uuid;
begin
  if p_person_id is null or p_value is null or btrim(p_value) = '' then
    raise exception 'record_verified_contact: person_id und value sind pflicht';
  end if;
  if p_kind not in ('email','phone') then
    raise exception 'record_verified_contact: ungueltiges kind %', p_kind;
  end if;
  if p_source not in ('auth_email_confirmed','auth_phone_confirmed','otp','magic_link','airdrop_accept') then
    raise exception 'record_verified_contact: ungueltige source %', p_source;
  end if;

  if p_kind = 'email' then
    v_value := lower(btrim(p_value));
  else
    v_value := regexp_replace(btrim(p_value), '\s+', '', 'g');
  end if;

  insert into public.verified_contacts (person_id, kind, value, source, source_ref, verified_at)
  values (p_person_id, p_kind, v_value, p_source, p_source_ref, coalesce(p_verified_at, now()))
  on conflict (person_id, kind, value) do update
    set verified_at = least(verified_contacts.verified_at, excluded.verified_at),
        source_ref  = coalesce(verified_contacts.source_ref, excluded.source_ref)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_verified_contact(uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.record_verified_contact(uuid,text,text,text,text,timestamptz) to service_role;
