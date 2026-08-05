-- AAR-956/AAR-939 Nachtrag: embed_sites Nutzungs-Tracking (Audit 05.08.).
-- (1) anfragen_gesamt/letzte_anfrage_am wurden seit Baseline nie gepflegt (kein
--     Trigger, kein Code-Write) -> Admin/SV-Listen zeigten dauerhaft 0.
--     AFTER-INSERT-Trigger auf gutachter_finder_anfragen + Backfill.
-- (2) Impression-Tracking: Widget-Config-Loads (config_hits/letzter_config_hit_am/
--     letzter_config_origin) zeigen, ob/wo das Monika-Widget eingebaut ist,
--     BEVOR die erste Anfrage kommt. Bump via service-only RPC, weil supabase-js
--     kein atomares "col = col + 1" kann.

alter table public.embed_sites
  add column if not exists config_hits integer not null default 0,
  add column if not exists letzter_config_hit_am timestamptz,
  add column if not exists letzter_config_origin text;

create or replace function public.bump_embed_site_anfragen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.embed_site_id is not null then
    update public.embed_sites
       set anfragen_gesamt   = anfragen_gesamt + 1,
           letzte_anfrage_am = coalesce(new.erstellt_am, now())
     where id = new.embed_site_id;
  end if;
  return new;
exception when others then
  -- Zaehler ist Telemetrie: ein Fehler hier darf den Anfrage-Insert nie brechen.
  return new;
end;
$$;

revoke execute on function public.bump_embed_site_anfragen() from public, anon, authenticated;

drop trigger if exists trg_bump_embed_site_anfragen on public.gutachter_finder_anfragen;
create trigger trg_bump_embed_site_anfragen
  after insert on public.gutachter_finder_anfragen
  for each row execute function public.bump_embed_site_anfragen();

-- Backfill (idempotent; Stand 05.08. sind 0 Rows betroffen — korrekt fuer Restores)
update public.embed_sites es
   set anfragen_gesamt   = sub.n,
       letzte_anfrage_am = sub.letzte
  from (
    select embed_site_id, count(*)::int as n, max(erstellt_am) as letzte
      from public.gutachter_finder_anfragen
     where embed_site_id is not null
     group by embed_site_id
  ) sub
 where es.id = sub.embed_site_id;

create or replace function public.bump_embed_config_hit(p_slug text, p_origin text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.embed_sites
     set config_hits           = config_hits + 1,
         letzter_config_hit_am = now(),
         letzter_config_origin = coalesce(nullif(left(btrim(p_origin), 255), ''), letzter_config_origin)
   where slug = p_slug;
$$;

-- service-only: sonst koennte jeder anon-Client via REST-RPC fremde Zaehler manipulieren
revoke execute on function public.bump_embed_config_hit(text, text) from public, anon, authenticated;
grant execute on function public.bump_embed_config_hit(text, text) to service_role;
