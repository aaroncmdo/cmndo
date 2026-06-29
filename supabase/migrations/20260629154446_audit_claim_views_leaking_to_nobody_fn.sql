-- Empirischer Leak-Check: simuliert einen "Nobody" (random sub, authenticated) und zaehlt jede
-- app-granted View MIT claim_id-Spalte. Liefert Views, die >0 Zeilen zeigen = Leak (egal ob ungated
-- ODER fehlerhaft gegatet). Staerker als der statische Profil-Scan. CI asserted: Ergebnis LEER.
-- set_config(request.jwt.claims,..,true) ueberschreibt den service_role-JWT der rpc -> auth.role()
-- ist 'authenticated' (kein Bypass), auth.uid() = der random Nobody.
CREATE OR REPLACE FUNCTION public.audit_claim_views_leaking_to_nobody()
 RETURNS TABLE(view_name text, nobody_sieht_zeilen bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v record; cnt bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
  FOR v IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
      AND EXISTS (SELECT 1 FROM information_schema.columns col
                  WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'claim_id')
      AND EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                  WHERE g.table_schema = 'public' AND g.table_name = c.relname AND g.privilege_type = 'SELECT'
                    AND g.grantee IN ('anon','authenticated'))
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v.relname) INTO cnt;
    IF cnt > 0 THEN view_name := v.relname; nobody_sieht_zeilen := cnt; RETURN NEXT; END IF;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.audit_claim_views_leaking_to_nobody() FROM public;
GRANT EXECUTE ON FUNCTION public.audit_claim_views_leaking_to_nobody() TO service_role;
