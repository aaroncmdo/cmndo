-- Vier neue claims-Spalten waren weder gegrantet noch als intern deklariert. Der
-- Claims-Column-Grants-Check meldete sie als NEUE_SPALTE und faerbte die CI auf
-- staging rot (01.09., drei Laeufe). Entscheidung Aaron 01.09.:
--
--   auswertung_unverbindlich -> KUNDENSICHTBAR  => SELECT-Grant fuer authenticated
--   ist_testfall             -> intern (Testmarker, kein Endkunden-Belang)
--   source_channel           -> intern (Attribution)
--   source_domain            -> intern (Attribution)
--
-- Vorab geprueft (sonst tauscht man einen gelben Befund gegen einen roten):
--   * keine der vier ist aktuell fuer authenticated/anon lesbar  -> kein LEAK
--   * keine laeuft roh durch v_claim_base                        -> kein VIEW_DRIFT

-- 1) Kundensichtbare Spalte granten.
grant select (auswertung_unverbindlich) on public.claims to authenticated;

-- 2) Die drei internen Marker in die Audit-Liste aufnehmen. Funktionsrumpf
--    unveraendert uebernommen (pg_get_functiondef), nur v_intern erweitert.
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
    'netzwerk_owner_id',  -- Netzwerk-Bindung (P0/P3): admin/service-role-only (Seed + Finder-Partition), kein User-Client-Read
    -- 01.09.2026: Testmarker + Herkunfts-Attribution (#5813). Rein interne Steuerdaten;
    -- ein Endkunde hat keinen Belang daran, ueber welchen Kanal sein Fall entstand.
    'ist_testfall','source_channel','source_domain'
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
