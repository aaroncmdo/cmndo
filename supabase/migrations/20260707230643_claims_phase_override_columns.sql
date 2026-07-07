-- Phase 1d: enum-safe manual phase override for admin/KB intervention.
-- CHECK constrains to valid ClaimMainPhase values (the old admin status-override crashed
-- on enum-foreign values -> v_claim_base cast-500). All columns NULL by default -> the
-- v_claim_phase COALESCE is provably behavior-neutral until someone sets an override.
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS phase_override text
    CHECK (phase_override IS NULL OR phase_override IN ('erfassung','begutachtung','regulierung','abschluss')),
  ADD COLUMN IF NOT EXISTS phase_override_grund text,
  ADD COLUMN IF NOT EXISTS phase_override_von uuid,
  ADD COLUMN IF NOT EXISTS phase_override_am timestamptz;
