-- KI-Aufsicht: erlaubt quelle='aufsicht' auf dem geteilten ai_claim_proposals-Spine.
-- Additiv; Bestandswerte (orchestrator/copilot) erfuellen den neuen CHECK -> safe.

alter table public.ai_claim_proposals drop constraint if exists ai_claim_proposals_quelle_check;
alter table public.ai_claim_proposals add constraint ai_claim_proposals_quelle_check
  check (quelle in ('orchestrator','copilot','aufsicht'));
