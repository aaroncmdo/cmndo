-- Task 3 (Spec/Plan 2026-06-27): Row-Gate + Column-Nuller in die Claim-Views (Ansatz B).
-- v_claim_base: Gate + Column-Nuller -> deckt 4 Layer-Views (v_claim_full,
-- v_faelle_mit_aktuellem_termin, faelle_sv_view, faelle_kunde_view). 3 Standalone-Views
-- (v_claim_phase/listing/parties_safe): nur Gate.
-- Self-guarding/idempotent (guard auf claim_sichtbar_fuer); capture+wrap der aktuellen def;
-- format_type-Cast erhaelt typmod (sonst lehnt CREATE OR REPLACE den Spalten-Typ ab).
-- CREATE OR REPLACE erzwingt identische Output-Shape -> Consumer koennen nicht brechen.

-- 1) v_claim_base: Gate + Column-Nuller (mit exaktem Typ-Cast)
do $mig$
declare v_def text; v_cols text;
begin
  if (select pg_get_viewdef('public.v_claim_base'::regclass) not ilike '%claim_sichtbar_fuer%') then
    v_def := rtrim(btrim(pg_get_viewdef('public.v_claim_base'::regclass, true)), ';');
    select string_agg(
      case
        when a.attname in ('iban','bic','kontoinhaber','halter_geburtsdatum')
          then format('(case when public.rolle_sieht_bankdaten() then sub.%I else null end)::%s as %I', a.attname, pg_catalog.format_type(a.atttypid,a.atttypmod), a.attname)
        when a.attname in ('kanzlei_honorar','lead_preis_netto','marketing_provision')
          then format('(case when public.rolle_sieht_margen() then sub.%I else null end)::%s as %I', a.attname, pg_catalog.format_type(a.atttypid,a.atttypmod), a.attname)
        when a.attname = 'regulierung_betrag'
          then format('(case when public.rolle_sieht_regulierung() then sub.%I else null end)::%s as %I', a.attname, pg_catalog.format_type(a.atttypid,a.atttypmod), a.attname)
        when a.attname in ('wertminderung','reparaturkosten','nutzungsausfall')
          then format('(case when public.rolle_sieht_gutachtenwerte() then sub.%I else null end)::%s as %I', a.attname, pg_catalog.format_type(a.atttypid,a.atttypmod), a.attname)
        else format('sub.%I', a.attname)
      end, ', ' order by a.attnum)
    into v_cols
    from pg_attribute a
    where a.attrelid='public.v_claim_base'::regclass and a.attnum>0 and not a.attisdropped;
    execute format('create or replace view public.v_claim_base as select %s from (%s) sub where public.claim_sichtbar_fuer_aktuellen_user(sub.id)', v_cols, v_def);
  end if;
end $mig$;

-- 2) v_claim_phase: Gate
do $mig$
declare v_def text;
begin
  if (select pg_get_viewdef('public.v_claim_phase'::regclass) not ilike '%claim_sichtbar_fuer%') then
    v_def := rtrim(btrim(pg_get_viewdef('public.v_claim_phase'::regclass, true)), ';');
    execute format('create or replace view public.v_claim_phase as select * from (%s) sub where public.claim_sichtbar_fuer_aktuellen_user(sub.claim_id)', v_def);
  end if;
end $mig$;

-- 3) v_claim_listing: Gate
do $mig$
declare v_def text;
begin
  if (select pg_get_viewdef('public.v_claim_listing'::regclass) not ilike '%claim_sichtbar_fuer%') then
    v_def := rtrim(btrim(pg_get_viewdef('public.v_claim_listing'::regclass, true)), ';');
    execute format('create or replace view public.v_claim_listing as select * from (%s) sub where public.claim_sichtbar_fuer_aktuellen_user(sub.claim_id)', v_def);
  end if;
end $mig$;

-- 4) v_claim_parties_safe: Gate (Spalten-Masking bleibt im inneren def)
do $mig$
declare v_def text;
begin
  if (select pg_get_viewdef('public.v_claim_parties_safe'::regclass) not ilike '%claim_sichtbar_fuer%') then
    v_def := rtrim(btrim(pg_get_viewdef('public.v_claim_parties_safe'::regclass, true)), ';');
    execute format('create or replace view public.v_claim_parties_safe as select * from (%s) sub where public.claim_sichtbar_fuer_aktuellen_user(sub.claim_id)', v_def);
  end if;
end $mig$;
