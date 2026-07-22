-- AAR-956 Fix (Fleet-Blocker): schuldfrage + eigene_versicherung (Mig 20260722202021) als INTERN
-- deklarieren. Der claims-Spalten-Cap (Mig 20260714220455) grantet authenticated nur SPALTENWEISE
-- -> neue Spalten sind ungegrantet und wurden von der Drift-Bremse audit_claims_column_grants()
-- als NEUE_SPALTE geflaggt. Da check:claims-column-grants LIVE-PROD prueft, blockte das ALLE
-- SQL-PRs (auch unbeteiligte, z.B. #4709). Beide Spalten werden NUR via Admin/service_role am
-- Konversionspunkt (convert-lead-to-claim.ts) geschrieben und von KEINEM User-Client gelesen
-- (repo-weit verifiziert) -> korrekt cappen, NICHT granten (Muster kanzlei_id). v_intern erweitert
-- + defensiver REVOKE (idempotent; es existiert kein Table-Grant, sonst waere es LEAK statt NEUE_SPALTE).
revoke select (schuldfrage, eigene_versicherung) on public.claims from authenticated, anon;

create or replace function public.audit_claims_column_grants()
returns table (befund text, spalte text, detail text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_def      text;
  v_intern   text[] := array[
    'notizen','interne_notizen','marketing_provision','lead_preis_netto','lead_preis_typ',
    'lead_preis_berechnet_am','kanzlei_honorar','kanzlei_provision_status','kanzlei_provision_ausgezahlt_am',
    'schuldfrage','eigene_versicherung'
  ];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'audit_claims_column_grants() ist auf service_role beschraenkt';
  end if;

  -- (a) LEAK: interne Spalte wieder lesbar?
  return query
    select 'LEAK'::text,
           c.column_name::text,
           ('interne Spalte ist fuer ' || r || ' wieder SELECT-bar — Cap verloren (Mig 20260714220455)')::text
    from information_schema.columns c, unnest(array['authenticated','anon']) r
    where c.table_schema='public' and c.table_name='claims'
      and c.column_name = any(v_intern)
      and has_column_privilege(r, 'public.claims', c.column_name, 'SELECT');

  -- (b) NEUE_SPALTE: weder gegrantet noch deklariert
  return query
    select 'NEUE_SPALTE'::text,
           c.column_name::text,
           'neue claims-Spalte ohne SELECT-Grant fuer authenticated. Entweder granten (GRANT SELECT (spalte) ON claims TO authenticated) oder als intern in audit_claims_column_grants() + Cap-Migration deklarieren. Sonst ist sie fuer User-Clients unsichtbar (stiller PostgREST-Fehler).'::text
    from information_schema.columns c
    where c.table_schema='public' and c.table_name='claims'
      and not (c.column_name = any(v_intern))
      and not has_column_privilege('authenticated', 'public.claims', c.column_name, 'SELECT');

  -- (c) VIEW_DRIFT: interne Spalte laeuft roh durch v_claim_base
  v_def := pg_get_viewdef('public.v_claim_base'::regclass, true);
  return query
    select 'VIEW_DRIFT'::text,
           s::text,
           'laeuft ROH durch v_claim_base (CASE-Maskierung verloren) — jede Rolle mit Zeilen-Sicht liest den Wert wieder. Gate wiederherstellen: rolle_sieht_margen() bzw. rolle_sieht_fallnotizen().'::text
    from unnest(v_intern) s
    where position(E'\n    sub.' || s || ',' in v_def) > 0;
end;
$function$;

revoke all on function public.audit_claims_column_grants() from public, anon, authenticated;
grant execute on function public.audit_claims_column_grants() to service_role;

comment on function public.audit_claims_column_grants() is
  'Drift-Bremse claims-Spalten-Cap: liefert LEAK / NEUE_SPALTE / VIEW_DRIFT. Leer == gesund. Konsument: scripts/check-claims-column-grants.mjs (CI).';
