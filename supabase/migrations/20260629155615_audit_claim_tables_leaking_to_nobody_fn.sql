-- SUPERSEDED / VERWORFEN — sofort gedroppt in 20260629160012_drop_audit_claim_tables_leaking_to_nobody_fn.sql.
-- Versuch, Tabellen-RLS via DB-Funktion zu testen (SET LOCAL ROLE authenticated + Nobody-JWT, damit
-- RLS greift). Funktioniert NICHT: "cannot set parameter role within security-definer function". Die
-- CREATE gelingt, aber jeder Aufruf wirft -> im naechsten Migrationsschritt gedroppt. Tabellen-RLS
-- (anders als View-Gates) kann nur ueber einen ECHTEN authenticated-Client getestet werden, weil
-- postgres/service_role RLS bypassen -> scripts/check-claim-table-rls.mjs (supabase-js + Nobody-User).
-- File committed nur fuer Lineage-Konsistenz (getrackte Version == File, AGENTS.md Regel 2).
CREATE OR REPLACE FUNCTION public.audit_claim_tables_leaking_to_nobody()
 RETURNS TABLE(table_name text, nobody_sieht_zeilen bigint)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  t text; cnt bigint;
  tbls text[] := ARRAY['claims','gutachter_termine','fall_dokumente','abrechnungen',
                       'claim_parties','gutachten','forderungspositionen','claim_vehicle_involvements'];
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  FOREACH t IN ARRAY tbls LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO cnt;
      IF cnt > 0 THEN table_name := t; nobody_sieht_zeilen := cnt; RETURN NEXT; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  RESET ROLE;
END;
$function$;
REVOKE ALL ON FUNCTION public.audit_claim_tables_leaking_to_nobody() FROM public;
GRANT EXECUTE ON FUNCTION public.audit_claim_tables_leaking_to_nobody() TO service_role;
