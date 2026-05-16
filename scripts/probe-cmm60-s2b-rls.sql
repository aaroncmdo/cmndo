-- CMM-60 Schritt-2b RLS-Impersonation: v_claim_sv unter echtem SV-Auth-Kontext.
-- Transaktional, ROLLBACK. SV_PROFILE_ID/SV_ID werden vor dem Lauf befuellt.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','<SV_PROFILE_ID>','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

SELECT chk, result FROM (
  SELECT 1 AS ord, 'SV sieht im View nur eigene Claims' AS chk,
    ((SELECT count(*) FROM public.v_claim_sv)
     = (SELECT count(*) FROM public.claims WHERE sv_id='<SV_ID>'))::text AS result
  UNION ALL
  SELECT 2, 'View liefert >0 Zeilen fuer diesen SV',
    ((SELECT count(*) FROM public.v_claim_sv) > 0)::text
) q ORDER BY ord;

ROLLBACK;
