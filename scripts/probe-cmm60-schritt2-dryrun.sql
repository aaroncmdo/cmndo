-- CMM-60 Schritt-2 Dry-Run: Migration transaktional ausfuehren + verifizieren,
-- dann ROLLBACK -> keine echte Aenderung. Prueft Syntax + Ausfuehrbarkeit +
-- dass is_sv_for_claim danach claims.sv_id-basiert korrekt antwortet.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_sv_for_claim(p_claim_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM claims c
    JOIN sachverstaendige sv ON sv.id = c.sv_id
    WHERE c.id = p_claim_id AND sv.profile_id = auth.uid()
  )
$function$;

GRANT EXECUTE ON FUNCTION public.is_sv_for_claim(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sv_for_claim(uuid) TO service_role;

DROP TRIGGER IF EXISTS trg_sync_faelle_sv_id_to_claims ON public.faelle;
CREATE TRIGGER trg_sync_faelle_sv_id_to_claims
  AFTER INSERT OR UPDATE OF sv_id ON public.faelle
  FOR EACH ROW EXECUTE FUNCTION public.sync_faelle_sv_id_to_claims();

UPDATE public.claims c SET sv_id = f.sv_id
FROM public.faelle f
WHERE f.claim_id = c.id AND c.sv_id IS NULL AND f.sv_id IS NOT NULL;

ALTER POLICY cp_sv_assigned_insert ON public.claim_parties
  WITH CHECK (
    rolle = 'zeuge'::text
    AND public.is_sv_for_claim(claim_parties.claim_id)
  );

-- Verifikation: is_sv_for_claim liefert fuer einen Claim mit sv_id, dessen
-- SV-Profil wir simulieren, true; fuer einen fremden auth.uid() false.
-- (Wir koennen auth.uid() nicht setzen; daher Aequivalenz-Check der Logik:
--  claims.sv_id-Join muss dieselbe (claim_id, profile_id)-Menge liefern wie
--  der alte faelle-Join.)
SELECT chk, result FROM (
  SELECT 1 AS ord, 'aequivalenz claims.sv_id-join vs faelle.sv_id-join' AS chk,
    (
      (SELECT count(*) FROM claims c JOIN sachverstaendige sv ON sv.id=c.sv_id)
      =
      (SELECT count(*) FROM faelle f JOIN sachverstaendige sv ON sv.id=f.sv_id
       WHERE f.claim_id IS NOT NULL)
    )::text AS result
  UNION ALL
  SELECT 2, 'trigger feuert auf INSERT UND UPDATE',
    (SELECT ((tgtype & 4 = 4) AND (tgtype & 16 = 16))::text
     FROM pg_trigger WHERE tgname='trg_sync_faelle_sv_id_to_claims')
  UNION ALL
  SELECT 3, 'cp_sv_assigned_insert nutzt is_sv_for_claim',
    (SELECT (with_check ILIKE '%is_sv_for_claim%')::text
     FROM pg_policies WHERE policyname='cp_sv_assigned_insert')
) q ORDER BY ord;

ROLLBACK;
