-- Phase 2b (Partner-Tier-Badge): oeffentlicher Rang neben Partner-Autoren in der
-- Community. Read-Zeit-Resolver: nimmt gerenderte Post/Kommentar-IDs und loest intern
-- Autor(author_id) -> Partner(makler/werkstatt/sv) -> partner_rang auf. Gibt NUR
-- gate-konforme Raenge (gate_ok, rang not null) fuer SICHTBARE, partner-authored Inhalte
-- zurueck. Kein author_id verlaesst die DB; keine Schema-Aenderung an community-Tabellen;
-- funktioniert fuer Bestand + neue Inhalte, immer frisch. Autor->Partner-Mapping spiegelt
-- _community_author (makler.user_id / werkstaetten.user_id / sachverstaendige.profile_id).
create or replace function public.community_content_rang(p_kind text, p_ids uuid[])
returns table(content_id uuid, rang text, sinnsatz text)
language sql
security definer
set search_path to 'public'
as $function$
  with authors as (
    select cp.id as content_id, cp.author_id
    from community_posts cp
    where p_kind = 'post' and cp.id = any(p_ids) and cp.status = 'sichtbar' and cp.author_kind = 'partner'
    union all
    select cc.id as content_id, cc.author_id
    from community_comments cc
    where p_kind = 'comment' and cc.id = any(p_ids) and cc.status = 'sichtbar' and cc.author_kind = 'partner'
  ),
  mapped as (
    select a.content_id,
           coalesce(mk.typ, wk.typ, sv.typ) as partner_typ,
           coalesce(mk.pid, wk.pid, sv.pid) as partner_id
    from authors a
    left join lateral (select 'makler'::text as typ, m.id as pid from makler m where m.user_id = a.author_id limit 1) mk on true
    left join lateral (select 'werkstatt'::text as typ, w.id as pid from werkstaetten w where w.user_id = a.author_id limit 1) wk on true
    left join lateral (select 'sachverstaendiger'::text as typ, s.id as pid from sachverstaendige s where s.profile_id = a.author_id limit 1) sv on true
  )
  select m.content_id, pr.rang, pr.sinnsatz
  from mapped m
  join partner_rang pr on pr.partner_typ = m.partner_typ and pr.partner_id = m.partner_id
  where m.partner_typ is not null and pr.gate_ok = true and pr.rang is not null;
$function$;

revoke all on function public.community_content_rang(text, uuid[]) from public;
grant execute on function public.community_content_rang(text, uuid[]) to anon, authenticated;
