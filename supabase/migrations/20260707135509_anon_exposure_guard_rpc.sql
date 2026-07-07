-- Fundament-Haertung (Audit 2026-07-07): systematischer anon-Exposure-Guard.
--
-- HINWEIS: Diese erste Version nutzte SET LOCAL ROLE anon in einer SECURITY DEFINER
-- Funktion — das ist in Postgres VERBOTEN (42501: cannot set parameter "role" within
-- security-definer function). Sie wird in der Folge-Migration
-- 20260707135655_anon_exposure_guard_enumerator.sql durch einen reinen Enumerator
-- ersetzt (der anon-Zugriff wird im CI-Guard via echtem anon-REST-Client gemessen).
-- Diese Datei bleibt as-applied committed (Twin-Drift-Vermeidung, AGENTS Regel 2).
CREATE OR REPLACE FUNCTION public.audit_anon_view_leaks()
 RETURNS TABLE(view_name text, anon_sieht_zeilen bigint)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE rels text[]; i int; cnt bigint;
BEGIN
  SELECT array_agg(c.relname ORDER BY c.relname) INTO rels
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
    AND has_table_privilege('anon', c.oid, 'SELECT');
  IF rels IS NULL THEN RETURN; END IF;

  SET LOCAL ROLE anon;
  FOR i IN 1 .. array_length(rels, 1) LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', rels[i]) INTO cnt;
    EXCEPTION WHEN OTHERS THEN
      cnt := 0;
    END;
    IF cnt > 0 THEN
      view_name := rels[i]; anon_sieht_zeilen := cnt; RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.audit_anon_view_leaks() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_anon_view_leaks() TO service_role;

-- v_claim_timeline: DEFINER-View (security_invoker nicht gesetzt) mit anon+auth Grant.
-- Echtes anon erroret (permission denied auf claims) -> kein Leak, aber unnoetige
-- anon-Grant-Flaeche auf Claim-Timeline-Daten. anon entziehen (authenticated bleibt).
REVOKE SELECT ON public.v_claim_timeline FROM anon;
