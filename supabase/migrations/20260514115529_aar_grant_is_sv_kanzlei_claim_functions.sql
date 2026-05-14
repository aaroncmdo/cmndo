-- AAR-Visual-Audit 14.05.2026 Folge: nach aar_fn_revoke_execute_security_definer
-- (PR-Migration 101645) haben mehrere is_*-RLS-Helper-Funktionen den
-- EXECUTE-Grant verloren. is_staff/is_admin/is_dispatcher/is_kundenbetreuer
-- wurden bereits via 20260514102431 zurück-gegrantet. Diese Migration
-- ergänzt die restlichen 5:
--
--   • is_sv()                  — RLS-Sub-Queries der sachverstaendige-Policies
--   • is_kanzlei()             — RLS-Sub-Queries der kanzlei-Policies
--   • is_claim_user_party(uuid) — RLS-Recursion-Fix aus cmm19_fix_rls_recursion
--   • is_dat_badge_sichtbar(uuid) — DAT-Badge-Visibility (aar515_verifizierung_v41)
--   • is_sv_for_claim(uuid)    — RLS für sachverstaendige_termine, gutachten (cmm19_v3)
--
-- Diese Functions sind SECURITY DEFINER (laufen mit owner-Privileg), aber
-- ihre EXECUTE-Permission steuert WER sie aufrufen darf. Wenn anon/
-- authenticated kein EXECUTE haben, schlagen RLS-Policies die diese
-- Functions verwenden silent fehl (Postgres wirft "permission denied for
-- function ..." was als Profil-Load-Crash erscheint).
--
-- Verify pre-apply:
--   SELECT proname,
--          has_function_privilege('authenticated', oid, 'EXECUTE') AS auth
--   FROM pg_proc
--   WHERE pronamespace='public'::regnamespace
--     AND proname IN ('is_sv','is_kanzlei','is_claim_user_party',
--                     'is_dat_badge_sichtbar','is_sv_for_claim');
--   → alle 5 = false
--
-- Verify post-apply: alle 5 = true.

GRANT EXECUTE ON FUNCTION public.is_sv() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_kanzlei() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_claim_user_party(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_dat_badge_sichtbar(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_sv_for_claim(uuid) TO anon, authenticated;
