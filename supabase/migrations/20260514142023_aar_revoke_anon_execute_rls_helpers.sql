-- Folge-Migration zu 20260514115529 (PR #1091).
--
-- #1091 hat 5 is_*-RLS-Helper-Functions GRANT'd TO anon, authenticated, um
-- silent RLS-Crashes nach der grossen REVOKE-Welle (20260514101645, PR #1076)
-- zu beheben. Der GRANT an anon war prophylaktisch — eine pg_policies/views/
-- pg_proc-Audit zeigt, dass anon die 5 Functions de-facto nirgends braucht:
--
--   • is_sv()                  — nur in authenticated-Policies (tasks, vertragsvorlagen)
--   • is_kanzlei()             — nur in authenticated-Policy (forderungspositionen)
--   • is_claim_user_party(uuid) — in claims/claim_parties (PUBLIC-roles policies),
--                                ABER anon hat keinen SELECT-Grant auf diese
--                                Tabellen, also feuert die Policy fuer anon eh nie
--   • is_dat_badge_sichtbar(uuid) — Orphan: 0 Policies, 0 Views, 0 andere Functions;
--                                  einzige Caller src/lib/sv/qualifikationen-gate.ts
--                                  ist Dead-Code (nirgends importiert)
--   • is_sv_for_claim(uuid)    — 0 Caller in DB + Code
--
-- Effekt: 5x `anon_security_definer_function_executable` Advisor-Lints wegnehmen,
-- ohne RLS-Pfade zu brechen. Authenticated-Grants bleiben unangetastet (die
-- werden weiter von Portal-Guards + RLS-Policies gebraucht — siehe AGENTS
-- Memory feedback_revoke_execute_rls_falle).
--
-- Verify pre-apply (alle 5 = true):
--   SELECT proname,
--          has_function_privilege('anon', oid, 'EXECUTE') AS anon_exec,
--          has_function_privilege('authenticated', oid, 'EXECUTE') AS auth_exec
--   FROM pg_proc
--   WHERE pronamespace='public'::regnamespace
--     AND proname IN ('is_sv','is_kanzlei','is_claim_user_party',
--                     'is_dat_badge_sichtbar','is_sv_for_claim');
--
-- Verify post-apply: anon_exec = false fuer alle 5; auth_exec bleibt true.

REVOKE EXECUTE ON FUNCTION public.is_sv()                       FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_kanzlei()                  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_claim_user_party(uuid)     FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_dat_badge_sichtbar(uuid)   FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_sv_for_claim(uuid)         FROM anon, PUBLIC;
