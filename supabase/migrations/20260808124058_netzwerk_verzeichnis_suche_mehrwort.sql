-- Profi-Verzeichnis Mehrwort-Suche: "Fehr Köln" fand 0 (der GANZE String wurde als
-- EIN Substring gesucht -> Queries ueber Feldgrenzen Name+Ort matchten nie).
-- Neu: q wird in Terme gesplittet; JEDER Term muss in irgendeinem Feld matchen
-- (AND ueber Terme, OR ueber Felder). Ein-Term-Queries verhalten sich identisch.
CREATE OR REPLACE FUNCTION public.netzwerk_verzeichnis_suche(q text, ziel_rolle text DEFAULT NULL::text)
 RETURNS TABLE(profil_id uuid, rolle text, anzeige_name text, ort text, avatar_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_caller_rolle text;
begin
  select p.rolle::text into v_caller_rolle from profiles p where p.id = auth.uid();
  if v_caller_rolle is null or v_caller_rolle not in ('sachverstaendiger','werkstatt','flottenmanager','makler') then
    return;
  end if;
  if length(coalesce(q,'')) < 2 then return; end if;

  return query
    select p.id,
           p.rolle::text,
           coalesce(sv.firmenname, wk.name, ff_firma.name, nullif(p.anzeigename,''),
                    nullif(trim(coalesce(p.vorname,'')||' '||coalesce(p.nachname,'')),''),
                    p.firma, 'Partner') as anzeige_name,
           nullif(trim(coalesce(wk.adresse_plz, sv.standort_plz, ff_firma.adresse_plz, p.plz, '')
                       ||' '||coalesce(wk.adresse_ort, p.ort, '')), '') as ort,
           p.avatar_url
      from profiles p
      left join sachverstaendige sv on sv.profile_id = p.id
      left join werkstaetten wk on wk.user_id = p.id
      left join firmen_flotten_konten ffk on ffk.user_id = p.id
      left join firmen ff_firma on ff_firma.id = ffk.firma_id
     where p.rolle::text in ('sachverstaendiger','werkstatt','flottenmanager')  -- Knoten-Rollen (Makler v1 kein Ziel)
       and p.id <> auth.uid()
       and (ziel_rolle is null or p.rolle::text = ziel_rolle)
       and not exists (
            select 1
              from unnest(regexp_split_to_array(trim(q), '\s+')) as t(term)
             where not (
                   (coalesce(p.vorname,'')||' '||coalesce(p.nachname,'')||' '||coalesce(p.firma,'')||' '||coalesce(p.anzeigename,'')) ilike '%'||t.term||'%'
                or coalesce(sv.firmenname,'') ilike '%'||t.term||'%'
                or coalesce(wk.name,'') ilike '%'||t.term||'%'
                or coalesce(ff_firma.name,'') ilike '%'||t.term||'%'
                or coalesce(wk.adresse_ort, p.ort, '') ilike '%'||t.term||'%'
                or coalesce(wk.adresse_plz, sv.standort_plz, ff_firma.adresse_plz, p.plz, '') ilike t.term||'%'
             )
       )
     order by anzeige_name
     limit 30;
end;
$function$;
