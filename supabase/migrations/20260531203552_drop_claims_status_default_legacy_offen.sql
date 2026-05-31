-- Convert-Breaker-Fix (AAR-940-Smoke entdeckt, 31.05.2026):
-- claims.status hatte DEFAULT 'offen' -- nach dem work_state-Cutover (T1.1b / PR #2136)
-- ist 'offen' NICHT mehr in claims_status_check. Der convert-lead-to-claim-Writer
-- setzt status seither nicht mehr explizit (erwartet NULL, schreibt nur work_state)
-- -> der Legacy-Default 'offen' griff -> JEDE Claim-Erzeugung (flow/dispatch/self-service)
-- brach mit claims_status_check. Default droppen: unset-status wird NULL (deckt sich mit
-- der Cutover-Achse "status = Lifecycle/Terminal, NULL bis Terminal/VS-Event").
-- 0 Alt-Claims mit status='offen' beim Apply (Track1 hatte die 75 bereits genullt).
ALTER TABLE claims ALTER COLUMN status DROP DEFAULT;
