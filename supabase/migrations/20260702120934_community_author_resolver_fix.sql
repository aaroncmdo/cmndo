-- Firma-Resolver-Korrektur: profiles.firma ist leer; die Partner-Firma liegt in
-- rollenspezifischen, user-verknuepften Tabellen. Best-effort coalesce ueber alle
-- user-verknuepften Quellen (makler.firma, werkstaetten.name, personen.firma,
-- profiles.firma, profiles.anzeigename). SV via sachverstaendige.firmenname hat keine
-- user_id -> greift ueber profiles.anzeigename (101 gesetzt), echte firmenname-Linkage = Follow-up.
create or replace function public._community_author(out o_kind text, out o_display text, out o_trusted bool)
language plpgsql security definer set search_path=public as $$
declare v_firma text; v_username text; v_trusted bool;
begin
  if auth.uid() is null then return; end if;
  if public.is_admin() then o_kind:='admin'; o_display:='Claimondo Redaktion'; o_trusted:=true; return; end if;
  select coalesce(
    (select nullif(trim(firma),'') from makler where user_id=auth.uid() limit 1),
    (select nullif(trim(name),'')  from werkstaetten where user_id=auth.uid() limit 1),
    (select nullif(trim(firma),'') from personen where user_id=auth.uid() and nullif(trim(firma),'') is not null limit 1),
    (select nullif(trim(firma),'') from profiles where id=auth.uid()),
    (select nullif(trim(anzeigename),'') from profiles where id=auth.uid())
  ) into v_firma;
  if v_firma is not null then o_kind:='partner'; o_display:=v_firma; o_trusted:=true; return; end if;
  select username, coalesce(trusted,false) into v_username, v_trusted from community_profiles where user_id=auth.uid();
  if v_username is not null then o_kind:='public'; o_display:=v_username; o_trusted:=v_trusted; return; end if;
end $$;
revoke all on function public._community_author() from public, anon, authenticated;
