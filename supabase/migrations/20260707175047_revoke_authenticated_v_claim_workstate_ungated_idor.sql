-- Applied on prod by the merge-session (35660476) as an immediate security mitigation:
-- v_claim_workstate was an ungated SECURITY DEFINER view granted to authenticated → IDOR
-- (any logged-in user could read all claims' work-state + PII). Revoked to unblock the
-- audit_ungated_definer_views() CI gate for all SQL PRs. Committed here by the view owner
-- for migration-chain hygiene (Regel 2). Superseded by 20260707180610, which re-GRANTs
-- authenticated AFTER adding the WHERE claim_sichtbar_fuer_aktuellen_user(claim_id) row-gate.
REVOKE ALL ON public.v_claim_workstate FROM authenticated;
