-- CI-Breaker-Fix (AN 332d22f1, Aaron dirigiert): claims.netzwerk_owner_id (Mig 20260729102640)
-- war weder gegrantet noch intern-deklariert -> check-claims-column-grants NEUE_SPALTE -> build-Job
-- ROT auf jedem Fleet-PR -> e2e geskippt -> Fundament-B1-Gate blockiert. Fix (A): intern deklarieren.
-- Kein User-Client liest netzwerk_owner_id (Seed via convert-lead-to-claim + Finder-Partition laufen
-- ueber admin/service-role); nur admin/service-role. Verifiziert: nicht auth/anon-lesbar, nicht in v_claim_base.

-- 1. Belt-and-suspenders: sicherstellen, dass die Spalte ungegrantet bleibt (claims hat keinen
--    Tabellen-Grant mehr -> Column-Revoke greift; idempotent).
revoke select (netzwerk_owner_id) on public.claims from authenticated;
revoke select (netzwerk_owner_id) on public.claims from anon;

-- 2. In die Intern-Deklaration der Audit-RPC aufnehmen (byte-identisch bis auf den v_intern-Eintrag).
create or replace function public.audit_claims_column_grants()
 returns table(befund text, spalte text, detail text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_def      text;
  v_intern   text[] := array[
    'notizen','interne_notizen','marketing_provision','lead_preis_netto','lead_preis_typ',
    'lead_preis_berechnet_am','kanzlei_honorar','kanzlei_provision_status','kanzlei_provision_ausgezahlt_am',
    'schuldfrage','eigene_versicherung',
    'netzwerk_owner_id'  -- Netzwerk-Bindung (P0/P3): admin/service-role-only (Seed + Finder-Partition), kein User-Client-Read
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
