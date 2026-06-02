-- CMM-49 Drop-Runway P3 (Batch FK-pilot-2 / Reader-Pattern): fall_summaries von faelle
-- entkoppeln. 0 Rows, claim_id bereits da (cmm49_rekey_batch_b). Einzige fall_id-Dependents:
-- der trg_derive_claim_id-Trigger (droppen; Funktion bleibt, ~40 Trigger-geteilt) + der Index
-- idx_fall_summaries_fall_id (faellt automatisch mit der Spalte). Einzige Policy
-- (fall_summaries_staff) ist rein rollenbasiert (kein fall_id) — kein Repoint noetig, live==Replay
-- (Baseline + live beide nur fall_summaries_staff). 5 Code-Reader sind auf claim_id repointet
-- (separater Commit, interim faelle.claim_id-Lookup, P4-TODO: aus Claim-Kontext threaden).
DROP TRIGGER IF EXISTS trg_derive_claim_id ON public.fall_summaries;
ALTER TABLE public.fall_summaries DROP COLUMN fall_id;
