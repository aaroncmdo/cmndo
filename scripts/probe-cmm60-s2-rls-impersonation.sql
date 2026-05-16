-- CMM-60 Schritt-2 RLS-Smoke: is_sv_for_claim unter echtem SV-Auth-Kontext.
-- SV 677400bf-… / profile 75683284-… ist claim 10982763-… zugewiesen,
-- claim 326eabbe-… einem anderen SV. Transaktional, ROLLBACK.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','75683284-6843-40d6-8042-6937cb5ee36a','role','authenticated')::text,
  true);
SET LOCAL ROLE authenticated;

SELECT chk, result FROM (
  SELECT 1 AS ord, 'is_sv_for_claim(eigener claim) = true' AS chk,
         public.is_sv_for_claim('10982763-71ef-485e-8735-7ae8ec433523')::text AS result
  UNION ALL
  SELECT 2, 'is_sv_for_claim(fremder claim) = false',
         public.is_sv_for_claim('326eabbe-8c22-4202-b1d7-32e4b54f82f1')::text
  UNION ALL
  SELECT 3, 'SV sieht eigenen claim ueber RLS-Policy',
         EXISTS(SELECT 1 FROM public.claims WHERE id='10982763-71ef-485e-8735-7ae8ec433523')::text
) q ORDER BY ord;

ROLLBACK;
