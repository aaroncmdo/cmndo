-- CMM-60 Schritt-2b RLS-Impersonation: v_claim_sv unter echtem SV-Auth-Kontext.
-- Transaktional, ROLLBACK. SV_PROFILE_ID/SV_ID werden vor dem Lauf befuellt.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','75683284-6843-40d6-8042-6937cb5ee36a','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

SELECT chk, result FROM (
  SELECT 1 AS ord, 'SV sieht im View nur eigene Claims' AS chk,
    ((SELECT count(*) FROM public.v_claim_sv)
     = (SELECT count(*) FROM public.claims WHERE sv_id='677400bf-dd31-4581-a645-07a7d624c190'))::text AS result
  UNION ALL
  SELECT 2, 'View liefert >0 Zeilen fuer diesen SV',
    ((SELECT count(*) FROM public.v_claim_sv) > 0)::text
) q ORDER BY ord;

ROLLBACK;
