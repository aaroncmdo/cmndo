-- CMM-49 gegner Tier-2 Cutover Schritt 1/2: Backfill verursacher-party insurance aus
-- claims.gegner_versicherungsnummer/aktenzeichen (value-neutral fuer den anschliessenden View-Flip).
-- 1 Claim betroffen (CLM-2026-00115, keine verursacher-Party) -> INSERT; UPDATE-Zweig fuer eine
-- ggf. existierende Party ohne Werte. Idempotent (NOT EXISTS / COALESCE).
UPDATE public.claim_parties cp
SET versicherungsnummer = COALESCE(cp.versicherungsnummer, c.gegner_versicherungsnummer),
    versicherungs_aktenzeichen = COALESCE(cp.versicherungs_aktenzeichen, c.gegner_aktenzeichen)
FROM public.claims c
WHERE cp.claim_id = c.id AND cp.rolle = 'verursacher'
  AND (c.gegner_versicherungsnummer IS NOT NULL OR c.gegner_aktenzeichen IS NOT NULL)
  AND (cp.versicherungsnummer IS NULL OR cp.versicherungs_aktenzeichen IS NULL);

INSERT INTO public.claim_parties (claim_id, rolle, reihenfolge, quelle, versicherungsnummer, versicherungs_aktenzeichen)
SELECT c.id, 'verursacher', 2, 'manuell_kb', c.gegner_versicherungsnummer, c.gegner_aktenzeichen
FROM public.claims c
WHERE (c.gegner_versicherungsnummer IS NOT NULL OR c.gegner_aktenzeichen IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.claim_parties cp WHERE cp.claim_id = c.id AND cp.rolle = 'verursacher');
