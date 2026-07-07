-- Aaron 2026-07-07: registrierte Partner sollen fuer die Community-Identitaet IMMER
-- ueber Firma -> Ansprechpartner erkannt werden, statt in "Kein Profil – bitte zuerst
-- einen Nutzernamen setzen" zu laufen (der RPC-Fehler aus create_community_post/comment).
-- Strikt ADDITIV: die bestehenden 5 Coalesce-Quellen bleiben unveraendert (Reihenfolge +
-- Verhalten); die neuen Quellen greifen NUR, wenn oben alles NULL ist. Damit keine
-- Regression fuer bereits aufgeloeste Partner, aber SV (sachverstaendige.firmenname via
-- profile_id), Organisationen und Namens-Fallbacks (vorname+nachname) werden jetzt erkannt.
-- HINWEIS: die vorname+nachname-Fallbacks auf personen/profiles waren zu breit und werden
-- in der Folgemigration community_author_partner_only_resolution wieder entfernt.
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
    (select nullif(trim(firma),'') from makler where user_id=auth.uid() limit 1),
    (select nullif(trim(name),'')  from werkstaetten where user_id=auth.uid() limit 1),
    (select nullif(trim(firma),'') from personen where user_id=auth.uid() and nullif(trim(firma),'') is not null limit 1),
    (select nullif(trim(firma),'') from profiles where id=auth.uid()),
    (select nullif(trim(anzeigename),'') from profiles where id=auth.uid()),
    (select nullif(trim(firmenname),'') from sachverstaendige where profile_id=auth.uid() limit 1),
    (select nullif(trim(name),'') from organisationen where hauptansprechpartner_user_id=auth.uid() or parent_user_id=auth.uid() limit 1),
    (select nullif(trim(concat_ws(' ', nullif(trim(ansprechpartner_vorname),''), nullif(trim(ansprechpartner_nachname),''))),'') from makler where user_id=auth.uid() limit 1),
    (select nullif(trim(concat_ws(' ', nullif(trim(vorname),''), nullif(trim(nachname),''))),'') from personen where user_id=auth.uid() limit 1),
    (select nullif(trim(concat_ws(' ', nullif(trim(vorname),''), nullif(trim(nachname),''))),'') from profiles where id=auth.uid())
  ) into v_firma;
  if v_firma is not null then o_kind:='partner'; o_display:=v_firma; o_trusted:=true; return; end if;
  select username, coalesce(trusted,false) into v_username, v_trusted from community_profiles where user_id=auth.uid();
  if v_username is not null then o_kind:='public'; o_display:=v_username; o_trusted:=v_trusted; return; end if;
end $function$;

-- Public-Wrapper: erlaubt der Marketing-App (getAuthState + Kommentar-/Beitrags-Formulare),
-- die aufgeloeste Community-Identitaet des aktuellen Users zu lesen und die manuelle
-- Nutzernamen-Stage fuer bereits erkannte Partner zu ueberspringen.
CREATE OR REPLACE FUNCTION public.community_my_identity(OUT kind text, OUT display text, OUT trusted boolean)
 RETURNS record
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select o_kind, o_display, o_trusted from public._community_author();
$function$;

REVOKE ALL ON FUNCTION public.community_my_identity() FROM public;
GRANT EXECUTE ON FUNCTION public.community_my_identity() TO authenticated;
