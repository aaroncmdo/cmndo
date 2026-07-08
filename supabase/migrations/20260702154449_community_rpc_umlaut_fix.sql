-- Umlaut-Korrektur der NUTZERSICHTBAREN Fehlermeldungen in den Community-Write-RPCs.
-- Diese Exceptions werden via mapRpcError -> setError direkt im Frontend (claimondo.de)
-- angezeigt und muessen echte Umlaute nutzen (AGENTS.md Sprache-Regel). Logik unveraendert
-- ggue. 20260702120417/20260702120934 -- nur die deutschen Strings + En-Dash bei Spannen.
-- Grants bleiben durch CREATE OR REPLACE erhalten.
create or replace function public.create_community_post(p_body text, p_tags text[] default '{}')
returns uuid language plpgsql security definer set search_path=public as $$
declare a record; v_id uuid; v_public_posts_enabled bool := false;
begin
  if auth.uid() is null then raise exception 'auth erforderlich'; end if;
  if char_length(coalesce(p_body,'')) not between 1 and 5000 then raise exception 'Beitrag: 1–5000 Zeichen'; end if;
  if (select count(*) from community_posts where author_id=auth.uid() and created_at > now()-interval '1 hour') >= 10
     then raise exception 'Zu viele Beiträge in kurzer Zeit – bitte später'; end if;
  select * into a from public._community_author();
  if a.o_kind is null then raise exception 'Kein Profil – bitte zuerst einen Nutzernamen setzen'; end if;
  if a.o_kind='public' and not v_public_posts_enabled then raise exception 'Beiträge sind aktuell nur für Partner freigeschaltet'; end if;
  if a.o_kind='public' and not a.o_trusted and p_body ~* '(https?://|www\.)' then raise exception 'Links erst nach Freischaltung möglich'; end if;
  insert into community_posts(author_id, author_kind, author_display, body, tags, status)
    values (auth.uid(), a.o_kind, a.o_display, p_body, coalesce(p_tags,'{}'), 'sichtbar') returning id into v_id;
  return v_id;
end $$;

create or replace function public.create_community_comment(p_target_kind text, p_target_id uuid, p_body text, p_parent_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare a record; v_id uuid;
begin
  if auth.uid() is null then raise exception 'auth erforderlich'; end if;
  if p_target_kind not in ('post','wissen') then raise exception 'target_kind ungültig'; end if;
  if char_length(coalesce(p_body,'')) not between 1 and 2000 then raise exception 'Kommentar: 1–2000 Zeichen'; end if;
  if (select count(*) from community_comments where author_id=auth.uid() and created_at > now()-interval '1 hour') >= 20
     then raise exception 'Zu viele Kommentare in kurzer Zeit'; end if;
  if p_parent_id is not null and exists(select 1 from community_comments where id=p_parent_id and parent_id is not null)
     then raise exception 'Nur eine Antwort-Ebene erlaubt'; end if;
  select * into a from public._community_author();
  if a.o_kind is null then raise exception 'Kein Profil – bitte zuerst einen Nutzernamen setzen'; end if;
  if a.o_kind='public' and not a.o_trusted and p_body ~* '(https?://|www\.)' then raise exception 'Links erst nach Freischaltung möglich'; end if;
  insert into community_comments(target_kind, target_id, author_id, author_kind, author_display, body, parent_id, status)
    values (p_target_kind, p_target_id, auth.uid(), a.o_kind, a.o_display, p_body, p_parent_id, 'sichtbar') returning id into v_id;
  return v_id;
end $$;
