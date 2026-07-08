-- Korrektur zu extend_community_author_partner_resolution: die vorherigen
-- vorname+nachname-Fallbacks auf profiles/personen waren ZU BREIT — sie haetten
-- JEDEN eingeloggten User (auch Kunden, die nur vorname/nachname haben) als
-- o_kind='partner' aufgeloest und damit das partner-only-Gate in create_community_post
-- (blockt nur o_kind='public') umgangen. Hier NUR partner-spezifische Quellen:
-- sachverstaendige.firmenname (SV), organisationen.name, makler-Ansprechpartner.
-- Kunden (nur profiles.vorname/nachname, kein firma/anzeigename/Rollen-Tabelle) fallen
-- weiterhin auf den 'public'/community_profiles-Pfad zurueck. Strikt: keine Kunden->Partner.
CREATE OR REPLACE FUNCTION public._community_author(OUT o_kind text, OUT o_display text, OUT o_trusted boolean)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_firma text; v_username text; v_trusted bool;
begin
  if auth.uid() is null then return; end if;
  if public.is_admin() then o_kind:='admin'; o_display:='Claimondo Redaktion'; o_trusted:=true; return; end if;
  select coalesce(
    -- Bestand (unveraendert):
    (select nullif(trim(firma),'') from makler where user_id=auth.uid() limit 1),
    (select nullif(trim(name),'')  from werkstaetten where user_id=auth.uid() limit 1),
    (select nullif(trim(firma),'') from personen where user_id=auth.uid() and nullif(trim(firma),'') is not null limit 1),
    (select nullif(trim(firma),'') from profiles where id=auth.uid()),
    (select nullif(trim(anzeigename),'') from profiles where id=auth.uid()),
    -- NEU – partner-spezifische Firmen-/Ansprechpartner-Quellen (fangen KEINE Kunden):
    (select nullif(trim(firmenname),'') from sachverstaendige where profile_id=auth.uid() limit 1),
    (select nullif(trim(name),'') from organisationen where hauptansprechpartner_user_id=auth.uid() or parent_user_id=auth.uid() limit 1),
    (select nullif(trim(concat_ws(' ', nullif(trim(ansprechpartner_vorname),''), nullif(trim(ansprechpartner_nachname),''))),'') from makler where user_id=auth.uid() limit 1)
  ) into v_firma;
  if v_firma is not null then o_kind:='partner'; o_display:=v_firma; o_trusted:=true; return; end if;
  select username, coalesce(trusted,false) into v_username, v_trusted from community_profiles where user_id=auth.uid();
  if v_username is not null then o_kind:='public'; o_display:=v_username; o_trusted:=v_trusted; return; end if;
end $function$;
