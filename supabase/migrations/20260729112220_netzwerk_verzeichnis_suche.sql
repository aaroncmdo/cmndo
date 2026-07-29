-- P1 T3: Profi-Verzeichnis-Suche. DEFINER + Selbst-Gate (profiles-SELECT-RLS = staff/self, ein
-- Policy-Fix rekursiert 42P17). Projiziert nur sichere Anzeige-Felder (kein email/telefon-Leak),
-- KEIN breiter profiles-SELECT-Grant. anon:EXECUTE bleibt (Supabase-Default-Priv, 134/211 Fns;
-- Muster search_makler) — Self-Gate liefert fuer anon (auth.uid() null) ein leeres Result.
create extension if not exists pg_trgm;
create index if not exists idx_profiles_trgm_name on public.profiles using gin ((coalesce(vorname,'')||' '||coalesce(nachname,'')||' '||coalesce(firma,'')||' '||coalesce(anzeigename,'')) gin_trgm_ops);
create index if not exists idx_profiles_trgm_ort on public.profiles using gin (ort gin_trgm_ops);
create index if not exists idx_werkstaetten_trgm_name on public.werkstaetten using gin (name gin_trgm_ops);
create index if not exists idx_sachverstaendige_trgm_firmenname on public.sachverstaendige using gin (firmenname gin_trgm_ops);

create or replace function public.netzwerk_verzeichnis_suche(q text, ziel_rolle text default null)
returns table(profil_id uuid, rolle text, anzeige_name text, ort text, avatar_url text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_caller_rolle text;
begin
  -- Selbst-Gate: nur eingeloggte Profis duerfen suchen (DEFINER umgeht RLS -> selbst gaten).
  select p.rolle::text into v_caller_rolle from profiles p where p.id = auth.uid();
  if v_caller_rolle is null or v_caller_rolle not in ('sachverstaendiger','werkstatt','flottenmanager','makler') then
    return;
  end if;
  if length(coalesce(q,'')) < 2 then return; end if;

  return query
    select p.id,
           p.rolle::text,
           coalesce(sv.firmenname, wk.name, nullif(p.anzeigename,''),
                    nullif(trim(coalesce(p.vorname,'')||' '||coalesce(p.nachname,'')),''),
                    p.firma, 'Partner') as anzeige_name,
           coalesce(wk.adresse_ort, p.ort) as ort,
           p.avatar_url
      from profiles p
      left join sachverstaendige sv on sv.profile_id = p.id
      left join werkstaetten wk on wk.user_id = p.id
     where p.rolle::text in ('sachverstaendiger','werkstatt','flottenmanager')  -- Knoten-Rollen (Makler v1 kein Ziel)
       and p.id <> auth.uid()                                                    -- nie sich selbst
       and (ziel_rolle is null or p.rolle::text = ziel_rolle)
       and (
            (coalesce(p.vorname,'')||' '||coalesce(p.nachname,'')||' '||coalesce(p.firma,'')||' '||coalesce(p.anzeigename,'')) ilike '%'||q||'%'
         or coalesce(sv.firmenname,'') ilike '%'||q||'%'
         or coalesce(wk.name,'') ilike '%'||q||'%'
         or coalesce(wk.adresse_ort, p.ort, '') ilike '%'||q||'%'
       )
     order by anzeige_name
     limit 30;
end;
$$;

revoke all on function public.netzwerk_verzeichnis_suche(text, text) from public;
grant execute on function public.netzwerk_verzeichnis_suche(text, text) to authenticated;
comment on function public.netzwerk_verzeichnis_suche(text, text) is
  'Netzwerk-Profi-Verzeichnis-Suche. DEFINER + Selbst-Gate; projiziert nur sichere Anzeige-Felder (kein email/telefon-Leak). Kein profiles-SELECT-Grant.';
