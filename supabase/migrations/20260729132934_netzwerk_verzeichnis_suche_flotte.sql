-- P1-Review-Fix (Important): Flotte-Partner mit Firmennamen (firmen_flotten_konten -> firmen.name)
-- in Anzeige UND Suche. CREATE OR REPLACE erhaelt Grants + Selbst-Gate; Signatur unveraendert.
create or replace function public.netzwerk_verzeichnis_suche(q text, ziel_rolle text default null)
returns table(profil_id uuid, rolle text, anzeige_name text, ort text, avatar_url text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
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
           coalesce(wk.adresse_ort, p.ort) as ort,
           p.avatar_url
      from profiles p
      left join sachverstaendige sv on sv.profile_id = p.id
      left join werkstaetten wk on wk.user_id = p.id
      left join firmen_flotten_konten ffk on ffk.user_id = p.id
      left join firmen ff_firma on ff_firma.id = ffk.firma_id
     where p.rolle::text in ('sachverstaendiger','werkstatt','flottenmanager')  -- Knoten-Rollen (Makler v1 kein Ziel)
       and p.id <> auth.uid()
       and (ziel_rolle is null or p.rolle::text = ziel_rolle)
       and (
            (coalesce(p.vorname,'')||' '||coalesce(p.nachname,'')||' '||coalesce(p.firma,'')||' '||coalesce(p.anzeigename,'')) ilike '%'||q||'%'
         or coalesce(sv.firmenname,'') ilike '%'||q||'%'
         or coalesce(wk.name,'') ilike '%'||q||'%'
         or coalesce(ff_firma.name,'') ilike '%'||q||'%'
         or coalesce(wk.adresse_ort, p.ort, '') ilike '%'||q||'%'
       )
     order by anzeige_name
     limit 30;
end;
$$;
