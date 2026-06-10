-- CMM-49 Route-Key B (Aaron 10.06.): claim_id ist kanonisch, fall_id + faelle_claim_bridge
-- sind transitionales Geruest (werden am Ende des Cutovers gedroppt).
--
-- Damit fall_id-Code waehrend der Transition fuer JEDEN Claim laeuft, braucht jeder Claim
-- einen Bridge-Eintrag. Die 78 faelle-Claims haben echte fall_ids (via sync_faelle_claim_bridge);
-- bridge-lose Claims (aktuell 1 Orphan ohne faelle) bekommen eine synthetische fall_id = claim_id.
-- KEIN value-preserving Backfill noetig (Route-Key B: fall-Detail disposable, 77/78 sind Fixtures).
--
-- WICHTIG (Sequencing): Der allgemeine "Bridge-from-claims"-Trigger fuer NEUE claim-only-Rows
-- kommt ATOMAR mit dem Converter-Cutover (faelle-Insert raus), NICHT vorher. Grund: solange der
-- Converter noch faelle erzeugt (Claim C -> dann faelle F, F<>C, beide -> Claim C), wuerde ein
-- Claims-Insert-Trigger einen zweiten Bridge-Eintrag (C,C) neben dem echten (F,C) anlegen. Bridge-PK
-- ist nur fall_id (claim_id NICHT unique), und v_claim_full joint die Bridge per
-- "LEFT JOIN faelle_claim_bridge ON claim_id" (kein LATERAL/LIMIT 1) -> zwei Bridge-Rows pro Claim
-- wuerden v_claim_full-Rows DUPLIZIEREN. Daher hier nur der Orphan-Backfill; der Trigger schaltet
-- mit dem Converter-Cutover.
--
-- Verifiziert nach Apply: claims_without_bridge=0, bridge_rows=claims=79,
-- claims_with_dup_bridge=0, v_claim_full=79 Rows (keine Duplikate).

INSERT INTO public.faelle_claim_bridge (fall_id, claim_id)
SELECT c.id, c.id
FROM public.claims c
LEFT JOIN public.faelle_claim_bridge b ON b.claim_id = c.id
WHERE b.claim_id IS NULL
ON CONFLICT (fall_id) DO NOTHING;
