-- Call-2 (Architektur-Entscheid 03.06.): read-only Admin-Dublettenliste.
-- SECURITY DEFINER + service_role-only (liest personen-PII => kein Client-Enumeration),
-- analog match_person_candidates. Liefert Kandidaten-PAARE gleicher Identitaetssignale
-- (email / nachname+geburtsdatum / telefon|mobil) ueber nicht-anonymisierte,
-- nicht-getombstonte personen. KEIN Merge — nur Sichtbarkeit (Hard-Merge bleibt YAGNI).
create or replace function public.admin_person_dupe_candidates(p_limit int default 200)
returns table (
  person_a_id uuid, person_a_name text, person_a_created timestamptz, person_a_has_account boolean,
  person_b_id uuid, person_b_name text, person_b_created timestamptz, person_b_has_account boolean,
  signal text, match_value text
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      id, user_id, created_at,
      nullif(lower(btrim(coalesce(email,''))), '')                          as nemail,
      nullif(regexp_replace(btrim(coalesce(telefon,'')), '\s+','','g'), '')  as ntel,
      nullif(regexp_replace(btrim(coalesce(mobil,'')),   '\s+','','g'), '')  as nmob,
      nullif(lower(btrim(coalesce(nachname,''))), '')                        as nname,
      geburtsdatum                                                          as gebdat,
      nullif(btrim(concat_ws(' ', vorname, nachname)), '')                  as display
    from public.personen
    where ist_anonymisiert = false and canonical_person_id is null
  ),
  pairs as (
    select a.id as a, a.display as da, a.created_at as ca, a.user_id as ua,
           b.id as b, b.display as db, b.created_at as cb, b.user_id as ub,
           'email'::text as signal, a.nemail as val
    from base a join base b
      on a.id < b.id and a.nemail is not null and a.nemail = b.nemail
    union all
    select a.id, a.display, a.created_at, a.user_id,
           b.id, b.display, b.created_at, b.user_id,
           'name_gebdat', a.nname || ' / ' || a.gebdat::text
    from base a join base b
      on a.id < b.id and a.nname is not null and a.gebdat is not null
         and a.nname = b.nname and a.gebdat = b.gebdat
    union all
    select a.id, a.display, a.created_at, a.user_id,
           b.id, b.display, b.created_at, b.user_id,
           'phone', coalesce(a.ntel, a.nmob)
    from base a join base b
      on a.id < b.id
         and coalesce(a.ntel, a.nmob) is not null
         and ( (a.ntel is not null and (a.ntel = b.ntel or a.ntel = b.nmob))
            or (a.nmob is not null and (a.nmob = b.ntel or a.nmob = b.nmob)) )
  )
  select a, da, ca, (ua is not null), b, db, cb, (ub is not null), signal, val
  from pairs
  order by signal, a, b
  limit greatest(coalesce(p_limit, 200), 1);
$$;

revoke all on function public.admin_person_dupe_candidates(int) from public, anon, authenticated;
grant execute on function public.admin_person_dupe_candidates(int) to service_role;
