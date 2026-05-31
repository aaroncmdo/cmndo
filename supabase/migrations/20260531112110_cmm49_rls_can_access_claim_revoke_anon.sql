-- can_access_claim: anon-EXECUTE revoken (Supabase-Default-Privilege), passend zu can_access_fall
-- + Projekt-Posture (RLS-Helper nicht anon-ausfuehrbar, vgl. aar_revoke_anon_execute_rls_helpers).
-- Harmlos (anon -> auth.uid() null -> false), aber Least-Privilege + konsistent.
REVOKE EXECUTE ON FUNCTION public.can_access_claim(uuid) FROM anon;
