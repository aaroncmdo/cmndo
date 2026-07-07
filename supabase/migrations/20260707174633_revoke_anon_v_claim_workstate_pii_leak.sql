-- Applied on prod by the merge-session (35660476) as an immediate security mitigation:
-- v_claim_workstate was created ungated + default-granted to anon → Claim-PII leak to anon.
-- Committed here by the view owner (ops-cockpit-rebuild) for migration-chain hygiene (Regel 2).
-- Superseded by 20260707180610 (row-gate); anon stays revoked (anon must never read claims).
REVOKE ALL ON public.v_claim_workstate FROM anon;
