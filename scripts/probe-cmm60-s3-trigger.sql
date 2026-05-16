-- CMM-60 Schritt-3 Trigger-Smoke: bidirektionale sv_id-Sync, loop-frei.
-- Transaktional mit ROLLBACK -> keine echte Datenaenderung.
BEGIN;

-- Einen Fall mit claim_id + sv_id waehlen, IDs in temp-Tabelle festhalten.
CREATE TEMP TABLE _smoke AS
  SELECT f.id AS faelle_id, f.claim_id, f.sv_id AS orig_sv
  FROM public.faelle f
  WHERE f.claim_id IS NOT NULL AND f.sv_id IS NOT NULL
  LIMIT 1;

-- 1. claims.sv_id -> NULL: Reverse-Trigger soll faelle.sv_id auf NULL spiegeln.
UPDATE public.claims SET sv_id = NULL
WHERE id = (SELECT claim_id FROM _smoke);

-- 2. claims.sv_id -> anderer SV: Reverse-Trigger zieht faelle mit.
UPDATE public.claims SET sv_id = (
  SELECT id FROM public.sachverstaendige
  WHERE id <> (SELECT orig_sv FROM _smoke) LIMIT 1
)
WHERE id = (SELECT claim_id FROM _smoke);

-- 3. faelle.sv_id -> NULL: Schritt-1-Trigger spiegelt zurueck nach claims.
UPDATE public.faelle SET sv_id = NULL
WHERE id = (SELECT faelle_id FROM _smoke);

SELECT chk, result FROM (
  SELECT 1 AS ord, 'claims->faelle gespiegelt (beide gleich nach Schritt 2/3)' AS chk,
    ((SELECT c.sv_id FROM public.claims c WHERE c.id = (SELECT claim_id FROM _smoke))
     IS NOT DISTINCT FROM
     (SELECT f.sv_id FROM public.faelle f WHERE f.id = (SELECT faelle_id FROM _smoke)))::text AS result
  UNION ALL
  SELECT 2, 'beide sv_id NULL nach faelle-NULL-Update (loop-frei, konsistent)',
    ((SELECT c.sv_id FROM public.claims c WHERE c.id = (SELECT claim_id FROM _smoke)) IS NULL
     AND (SELECT f.sv_id FROM public.faelle f WHERE f.id = (SELECT faelle_id FROM _smoke)) IS NULL)::text
) q ORDER BY ord;

ROLLBACK;
