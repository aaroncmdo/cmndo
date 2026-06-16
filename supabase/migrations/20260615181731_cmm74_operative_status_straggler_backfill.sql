-- CMM-74 / AAR-939: operative_status straggler-backfill.
-- #2884 (mig 20260615120559) backfillte operative_status := faelle.status fuer alle damals
-- existierenden Claims. Danach via convertLeadToClaim angelegte Stragglers blieben NULL:
--   e8787cb1 @14:15 = Prod-Deploy-Fenster (#2886 mergte 13:29, Prod-Rollout erst ~14:41)
--   e4cf4b2f @16:54 = non-Prod-Build/Test-Pollution (pre-#2886-Branch schreibt in geteilte DB)
-- convert setzt operative_status seit #2886 unconditional (:417) -> kein Creator-Fix noetig.
-- Dieser idempotente Re-Run schliesst die Stragglers, damit die claim-native state-machine
-- (AAR-939: operative_status = sole cursor, kein faelle.status-Fallback) nicht auf NULL bricht.
UPDATE claims c
SET operative_status = f.status, updated_at = now()
FROM faelle_claim_bridge b
JOIN faelle f ON f.id = b.fall_id
WHERE b.claim_id = c.id AND c.operative_status IS NULL;
