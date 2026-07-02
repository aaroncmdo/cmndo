-- B2B Content-Pipeline: wissen_themen bekommt Audience + Crawl-Herkunft; quelle erlaubt 'crawl';
-- Dedupe ueber source_hash; wissen_artikel bekommt source_url (Attribution).
alter table public.wissen_themen add column if not exists audience text not null default 'consumer' check (audience in ('consumer','b2b'));
alter table public.wissen_themen add column if not exists source_url text;
alter table public.wissen_themen add column if not exists source_name text;
alter table public.wissen_themen add column if not exists source_hash text;
alter table public.wissen_themen drop constraint if exists wissen_themen_quelle_check;
alter table public.wissen_themen add constraint wissen_themen_quelle_check check (quelle in ('ai_gap','manuell','crawl'));
create unique index if not exists wissen_themen_source_hash_uidx on public.wissen_themen(source_hash) where source_hash is not null;
alter table public.wissen_artikel add column if not exists source_url text;
