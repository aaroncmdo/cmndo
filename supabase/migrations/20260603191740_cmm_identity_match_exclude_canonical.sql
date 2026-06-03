-- Slice B Schaerfung #1 (Aaron): match_person_candidates schliesst superseded/canonical'd
-- Personen aus. Sonst taucht ein bereits re-gepointer Orphan erneut als "Match" auf.
-- Einzige Aenderung ggü. 20260603180419: zusaetzliche WHERE-Zeile "canonical_person_id is null".
-- match_person_candidates ist die einzige Kandidaten-Query => findOrphanPersonMatchesForUser
-- erbt den Filter (Single Source of Truth, keine Duplikation in TS).

create or replace function public.match_person_candidates(
  p_email             text default null,
  p_phone             text default null,
  p_vorname           text default null,
  p_nachname          text default null,
  p_geburtsdatum      date default null,
  p_exclude_person_id uuid default null,
  p_min_score         int  default 15,
  p_limit             int  default 10
) returns table (
  person_id uuid,
  score     int,
  tier      text,
  signals   text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with probe as (
    select
      nullif(lower(btrim(coalesce(p_email,''))), '')                         as email,
      nullif(regexp_replace(btrim(coalesce(p_phone,'')), '\s+','','g'), '')  as phone,
      nullif(lower(btrim(coalesce(p_vorname,''))), '')                       as vorname,
      nullif(lower(btrim(coalesce(p_nachname,''))), '')                      as nachname,
      p_geburtsdatum                                                         as gebdat
  ),
  flags as (
    select
      pe.id as person_id,
      (pr.email is not null and exists (
         select 1 from verified_contacts vc
         where vc.person_id = pe.id and vc.kind='email' and vc.value = pr.email))   as ver_email,
      (pr.phone is not null and exists (
         select 1 from verified_contacts vc
         where vc.person_id = pe.id and vc.kind='phone' and vc.value = pr.phone))   as ver_phone,
      (pr.nachname is not null and pr.gebdat is not null
         and lower(btrim(pe.nachname)) = pr.nachname
         and (pr.vorname is null or lower(btrim(pe.vorname)) = pr.vorname)
         and pe.geburtsdatum = pr.gebdat)                                           as name_gebdat,
      (pr.email is not null and lower(btrim(coalesce(pe.email,''))) = pr.email)     as typed_email,
      (pr.phone is not null and (
           regexp_replace(btrim(coalesce(pe.telefon,'')), '\s+','','g') = pr.phone
        or regexp_replace(btrim(coalesce(pe.mobil,'')),   '\s+','','g') = pr.phone)) as typed_phone,
      (pr.nachname is not null
         and lower(btrim(pe.nachname)) = pr.nachname
         and (pr.vorname is null or lower(btrim(pe.vorname)) = pr.vorname))         as name_match
    from public.personen pe cross join probe pr
    where pe.ist_anonymisiert = false
      and pe.canonical_person_id is null
      and (p_exclude_person_id is null or pe.id <> p_exclude_person_id)
  ),
  scored as (
    select
      person_id,
        (case when ver_email   then 60 else 0 end)
      + (case when ver_phone   then 60 else 0 end)
      + (case when name_gebdat then 35 else 0 end)
      + (case when typed_email then 15 else 0 end)
      + (case when typed_phone then 15 else 0 end)
      + (case when name_match and not name_gebdat then 8 else 0 end)               as score,
      case when ver_email or ver_phone then 'hart'
           when name_gebdat            then 'stark'
           else 'weich' end                                                        as tier,
      array_remove(array[
        case when ver_email   then 'verified_email' end,
        case when ver_phone   then 'verified_phone' end,
        case when name_gebdat then 'name_gebdat'    end,
        case when typed_email then 'typed_email'    end,
        case when typed_phone then 'typed_phone'    end,
        case when name_match and not name_gebdat then 'name_only' end
      ], null)                                                                      as signals
    from flags
    where ver_email or ver_phone or name_gebdat or typed_email or typed_phone or name_match
  )
  select person_id, score, tier, signals
  from scored
  where score >= greatest(coalesce(p_min_score, 0), 0)
  order by score desc, person_id
  limit greatest(coalesce(p_limit, 10), 1);
$$;

revoke all on function public.match_person_candidates(text,text,text,text,date,uuid,int,int) from public, anon, authenticated;
grant execute on function public.match_person_candidates(text,text,text,text,date,uuid,int,int) to service_role;
