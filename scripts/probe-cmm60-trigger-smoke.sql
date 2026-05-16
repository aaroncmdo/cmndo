-- CMM-60 Schritt-1 Trigger-Smoke: faelle.sv_id-Update -> claims.sv_id gespiegelt.
-- Transaktional mit ROLLBACK -> keine echte Datenaenderung.
-- faelle_id 0fa542a5-b323-4d98-a430-b9ce89e39453 / claim_id 0f19efb3-35d9-4bac-885a-993cb40c8f4e
BEGIN;

-- 1. sv_id auf NULL setzen -> Trigger soll claims.sv_id ebenfalls auf NULL spiegeln.
UPDATE public.faelle SET sv_id = NULL
WHERE id = '0fa542a5-b323-4d98-a430-b9ce89e39453';

-- 2. sv_id auf einen anderen SV setzen -> Trigger soll mitziehen.
UPDATE public.faelle SET sv_id = (
  SELECT id FROM public.sachverstaendige
  WHERE id <> '677400bf-dd31-4581-a645-07a7d624c190' LIMIT 1
)
WHERE id = '0fa542a5-b323-4d98-a430-b9ce89e39453';

-- 3. Verifikation: claims.sv_id == faelle.sv_id nach beiden Updates.
SELECT
  'trigger mirrors faelle.sv_id -> claims.sv_id' AS chk,
  (c.sv_id = f.sv_id AND c.sv_id IS NOT NULL)::text AS result,
  c.sv_id::text AS claims_sv_id,
  f.sv_id::text AS faelle_sv_id
FROM public.claims c
JOIN public.faelle f ON f.claim_id = c.id
WHERE c.id = '0f19efb3-35d9-4bac-885a-993cb40c8f4e';

ROLLBACK;
