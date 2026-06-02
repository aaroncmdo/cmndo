-- CMM-49 Drop-Runway P3 (Batch FK-ai-dead): ai_usage_log von faelle entkoppeln.
-- 51 Rows, claim_id bereits da (cmm49_rekey_batch_b); 0 unbackfilled (die 45 claim_id-NULL
-- Rows sind fall-los = generelle AI-Usage; die 6 fall-gebundenen haben claim_id). Beide Policies
-- (ai_usage_log_admin_read role-only, ai_usage_log_no_client_write = false) referenzieren KEIN
-- fall_id -> kein Repoint, live==Replay. Einzige fall_id-Dependents: trg_derive_claim_id
-- (droppen; Funktion bleibt, ~40 Trigger-geteilt) + Index idx_ai_usage_log_fall_id (faellt auto).
-- Writer logAiUsage ist auf claim_id repointet (interim faelle.claim_id-Lookup, P4-TODO).
DROP TRIGGER IF EXISTS trg_derive_claim_id ON public.ai_usage_log;
ALTER TABLE public.ai_usage_log DROP COLUMN fall_id;
