-- CMM-44 Phase-6 completeness: DB-side faelle dependencies that must be resolved before DROP TABLE faelle CASCADE.
\echo '== faelle column count =='
select count(*) as faelle_cols from information_schema.columns where table_name='faelle' and table_schema='public';

\echo '== VIEWS whose definition references faelle (die bei DROP CASCADE sterben) =='
select table_name from information_schema.views
where table_schema='public' and view_definition ilike '%faelle%' order by table_name;

\echo '== TRIGGERS on faelle (Phase 5: sync-trigger drop) =='
select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
where c.relname='faelle' and not t.tgisinternal order by tgname;

\echo '== sync-trigger functions referencing faelle<->claims =='
select proname from pg_proc where proname ilike '%sync%faelle%' or proname ilike '%sync%claims%' order by proname;

\echo '== FK dependents: tables whose FK references faelle (CASCADE/repoint vor DROP) =='
select conrelid::regclass::text as dependent_table, conname
from pg_constraint where confrelid='public.faelle'::regclass and contype='f' order by 1;
