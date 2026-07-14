-- SQL-Regel-Evaluator: portiert src/lib/dokumente/ruleEvaluator.ts nach PL/pgSQL.
-- Kanonische DB-getriebene Auswertung der dokument_katalog freigeschaltet_wenn/pflicht_wenn.

create or replace function public.dokument_regel_equals(a jsonb, b jsonb)
returns boolean language sql immutable as $func$
  select case
    when (a is null or a = 'null'::jsonb) and (b is null or b = 'null'::jsonb) then true
    when (a is null or a = 'null'::jsonb) or  (b is null or b = 'null'::jsonb) then false
    when a = b then true
    when (jsonb_typeof(a) = 'number' and jsonb_typeof(b) = 'string')
      or (jsonb_typeof(a) = 'string' and jsonb_typeof(b) = 'number')
      then (a #>> '{}') = (b #>> '{}')
    else false
  end
$func$;

create or replace function public.dokument_regel_num(v jsonb)
returns numeric language sql immutable as $func$
  select case
    when v is null or v = 'null'::jsonb then null
    when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
    when jsonb_typeof(v) = 'string' and btrim(v #>> '{}') <> ''
         and (v #>> '{}') ~ '^\s*-?(\d+\.?\d*|\.\d+)\s*$' then (v #>> '{}')::numeric
    else null
  end
$func$;

create or replace function public.dokument_regel_truthy(v jsonb)
returns boolean language sql immutable as $func$
  select case
    when v is null or v = 'null'::jsonb then false
    when jsonb_typeof(v) = 'boolean' then (v = 'true'::jsonb)
    when jsonb_typeof(v) = 'number'  then (v #>> '{}')::numeric <> 0
    when jsonb_typeof(v) = 'string'  then length(v #>> '{}') > 0
    when jsonb_typeof(v) = 'array'   then jsonb_array_length(v) > 0
    else true
  end
$func$;

create or replace function public.dokument_regel_trifft(regel jsonb, ctx jsonb)
returns boolean language plpgsql immutable as $func$
declare op text; fld text; cv jsonb;
begin
  if regel is null or regel = 'null'::jsonb then return true; end if;
  op := regel ->> 'op';
  if op is null then return true; end if;
  fld := regel ->> 'field';
  cv  := case when fld is null then null else ctx -> fld end;
  case op
    when 'eq'  then return public.dokument_regel_equals(cv, regel -> 'value');
    when 'neq' then return not public.dokument_regel_equals(cv, regel -> 'value');
    when 'in'  then
      if cv is null or cv = 'null'::jsonb then return false; end if;
      return exists (select 1 from jsonb_array_elements(regel -> 'value') e
                     where public.dokument_regel_equals(cv, e.value));
    when 'not_in' then
      if cv is null or cv = 'null'::jsonb then return true; end if;
      return not exists (select 1 from jsonb_array_elements(regel -> 'value') e
                         where public.dokument_regel_equals(cv, e.value));
    when 'gt'  then return public.dokument_regel_num(cv) is not null and public.dokument_regel_num(cv) >  (regel ->> 'value')::numeric;
    when 'lt'  then return public.dokument_regel_num(cv) is not null and public.dokument_regel_num(cv) <  (regel ->> 'value')::numeric;
    when 'gte' then return public.dokument_regel_num(cv) is not null and public.dokument_regel_num(cv) >= (regel ->> 'value')::numeric;
    when 'lte' then return public.dokument_regel_num(cv) is not null and public.dokument_regel_num(cv) <= (regel ->> 'value')::numeric;
    when 'is_null'     then return cv is null or cv = 'null'::jsonb;
    when 'is_not_null' then return cv is not null and cv <> 'null'::jsonb;
    when 'truthy' then return public.dokument_regel_truthy(cv);
    when 'falsy'  then return not public.dokument_regel_truthy(cv);
    when 'and' then return not exists (select 1 from jsonb_array_elements(regel -> 'conditions') c
                                       where not public.dokument_regel_trifft(c.value, ctx));
    when 'or'  then return exists (select 1 from jsonb_array_elements(regel -> 'conditions') c
                                   where public.dokument_regel_trifft(c.value, ctx));
    when 'not' then return not public.dokument_regel_trifft(regel -> 'condition', ctx);
    else return false;
  end case;
end;
$func$;

create or replace function public.dokument_katalog_ctx(p_claim_id uuid)
returns jsonb language sql stable as $func$
  select
    coalesce((
      select jsonb_object_agg('fall.' || e.key, e.value)
      from claims c, lateral jsonb_each(to_jsonb(c)) e
      where c.id = p_claim_id
    ), '{}'::jsonb)
    ||
    coalesce((
      select jsonb_object_agg('lead.' || e.key, e.value)
      from claims c
      join leads l on l.id = c.lead_id, lateral jsonb_each(to_jsonb(l)) e
      where c.id = p_claim_id
    ), '{}'::jsonb)
$func$;

grant execute on function public.dokument_regel_equals(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.dokument_regel_num(jsonb) to authenticated, service_role;
grant execute on function public.dokument_regel_truthy(jsonb) to authenticated, service_role;
grant execute on function public.dokument_regel_trifft(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.dokument_katalog_ctx(uuid) to authenticated, service_role;
