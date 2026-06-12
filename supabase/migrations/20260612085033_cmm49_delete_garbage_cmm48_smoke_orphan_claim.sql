-- CMM-49 DROP-Prep / Daten-Cleanup: 1 Garbage claim-only Claim ohne faelle.
-- claims.id 708e76a6-75a0-45c6-b1a6-d2b9c216f2f1 = CLM-2026-00155; hergang_kunde_text
-- "CMM-48-Smoke - Test-Lead automatisch erzeugt"; einzige claim_party = smoke-cmm48-
-- ...@test.local. Verifiziert 0 Rows in: faelle, kanzlei_faelle, gutachten, nachrichten,
-- claim_payments, tasks, auftraege, gutachter_termine, timeline, claim_vehicle_involvements,
-- forderungspositionen, vs_korrespondenz + alle 7 NO-ACTION-Blocker. Nur 1 claim_parties-Row
-- (ON DELETE CASCADE) + die Step-4 trg_sync_claims_to_bridge-Bridge-Row (CASCADE via
-- fk_bridge_claim #2719) -> beide raeumt der Claim-Delete mit ab.
-- Wirkung VOR Cleanup: bridge_komplett=35 vs faelle_komplett=34 -> Geister-Claim in jedem
-- bridge/claims-anchored komplett-List-Read (blockt Entitys kanzlei-Read-Migration). Danach 34==34.
-- Guard NOT EXISTS faelle: idempotent + fresh-db-safe (loescht nur wenn noch faelle-los = Garbage).
DELETE FROM public.claims
WHERE id = '708e76a6-75a0-45c6-b1a6-d2b9c216f2f1'
  AND NOT EXISTS (SELECT 1 FROM public.faelle f WHERE f.claim_id = '708e76a6-75a0-45c6-b1a6-d2b9c216f2f1');
