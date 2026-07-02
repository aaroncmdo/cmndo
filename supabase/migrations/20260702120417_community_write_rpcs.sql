-- Write-RPCs fuer die B2B-Community: Identitaets-Resolver + Safeguards + Immediate-Insert.
-- SECURITY DEFINER (nicht per Direct-API umgehbar), grant nur authenticated.
-- HINWEIS: _community_author wird in 20260702120934 auf robusten Firma-Coalesce korrigiert
-- (profiles.firma ist leer; Firma liegt in makler/werkstaetten/personen/profiles.anzeigename).
create or replace function public._community_author(out o_kind text, out o_display text, out o_trusted bool)
language plpgsql security definer set search_path=public as $$
declare v_firma text; v_username text; v_trusted bool;
begin
  if auth.uid() is null then return; end if;
  if public.is_admin() then o_kind:='admin'; o_display:='Claimondo Redaktion'; o_trusted:=true; return; end if;
  select nullif(trim(firma),'') into v_firma from profiles where id=auth.uid();
  if v_firma is not null then o_kind:='partner'; o_display:=v_firma; o_trusted:=true; return; end if;
  select username, coalesce(trusted,false) into v_username, v_trusted from community_profiles where user_id=auth.uid();
  if v_username is not null then o_kind:='public'; o_display:=v_username; o_trusted:=v_trusted; return; end if;
end $$;
revoke all on function public._community_author() from public, anon, authenticated;

create or replace function public.create_community_post(p_body text, p_tags text[] default '{}')
returns uuid language plpgsql security definer set search_path=public as $$
declare a record; v_id uuid; v_public_posts_enabled bool := false;
begin
  if auth.uid() is null then raise exception 'auth erforderlich'; end if;
  if char_length(coalesce(p_body,'')) not between 1 and 5000 then raise exception 'Beitrag: 1-5000 Zeichen'; end if;
  if (select count(*) from community_posts where author_id=auth.uid() and created_at > now()-interval '1 hour') >= 10
     then raise exception 'Zu viele Beitraege in kurzer Zeit - bitte spaeter'; end if;
  select * into a from public._community_author();
  if a.o_kind is null then raise exception 'Kein Profil - bitte zuerst einen Nutzernamen setzen'; end if;
  if a.o_kind='public' and not v_public_posts_enabled then raise exception 'Beitraege sind aktuell nur fuer Partner freigeschaltet'; end if;
  if a.o_kind='public' and not a.o_trusted and p_body ~* '(https?://|www\.)' then raise exception 'Links erst nach Freischaltung moeglich'; end if;
  insert into community_posts(author_id, author_kind, author_display, body, tags, status)
    values (auth.uid(), a.o_kind, a.o_display, p_body, coalesce(p_tags,'{}'), 'sichtbar') returning id into v_id;
  return v_id;
end $$;

create or replace function public.create_community_comment(p_target_kind text, p_target_id uuid, p_body text, p_parent_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare a record; v_id uuid;
begin
  if auth.uid() is null then raise exception 'auth erforderlich'; end if;
  if p_target_kind not in ('post','wissen') then raise exception 'target_kind ungueltig'; end if;
  if char_length(coalesce(p_body,'')) not between 1 and 2000 then raise exception 'Kommentar: 1-2000 Zeichen'; end if;
  if (select count(*) from community_comments where author_id=auth.uid() and created_at > now()-interval '1 hour') >= 20
     then raise exception 'Zu viele Kommentare in kurzer Zeit'; end if;
  if p_parent_id is not null and exists(select 1 from community_comments where id=p_parent_id and parent_id is not null)
     then raise exception 'Nur eine Antwort-Ebene erlaubt'; end if;
  select * into a from public._community_author();
  if a.o_kind is null then raise exception 'Kein Profil - bitte zuerst einen Nutzernamen setzen'; end if;
  if a.o_kind='public' and not a.o_trusted and p_body ~* '(https?://|www\.)' then raise exception 'Links erst nach Freischaltung moeglich'; end if;
  insert into community_comments(target_kind, target_id, author_id, author_kind, author_display, body, parent_id, status)
    values (p_target_kind, p_target_id, auth.uid(), a.o_kind, a.o_display, p_body, p_parent_id, 'sichtbar') returning id into v_id;
  return v_id;
end $$;

create or replace function public.toggle_like(p_target_kind text, p_target_id uuid)
returns bool language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'auth erforderlich'; end if;
  if p_target_kind not in ('post','wissen','comment') then raise exception 'target_kind ungueltig'; end if;
  delete from community_likes where user_id=auth.uid() and target_kind=p_target_kind and target_id=p_target_id;
  if found then return false; end if;
  insert into community_likes(user_id, target_kind, target_id) values (auth.uid(), p_target_kind, p_target_id) on conflict do nothing;
  return true;
end $$;

create or replace function public.report_target(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'auth erforderlich'; end if;
  if p_kind='post' then
    update community_posts set report_count=report_count+1 where id=p_id;
    update community_posts set status='versteckt', moderated_am=now() where id=p_id and report_count>=3 and status='sichtbar';
  elsif p_kind='comment' then
    update community_comments set report_count=report_count+1 where id=p_id;
    update community_comments set status='versteckt', moderated_am=now() where id=p_id and report_count>=3 and status='sichtbar';
  else raise exception 'kind ungueltig'; end if;
end $$;

revoke all on function public.create_community_post(text,text[]) from public, anon;
revoke all on function public.create_community_comment(text,uuid,text,uuid) from public, anon;
revoke all on function public.toggle_like(text,uuid) from public, anon;
revoke all on function public.report_target(text,uuid) from public, anon;
grant execute on function public.create_community_post(text,text[]) to authenticated;
grant execute on function public.create_community_comment(text,uuid,text,uuid) to authenticated;
grant execute on function public.toggle_like(text,uuid) to authenticated;
grant execute on function public.report_target(text,uuid) to authenticated;
