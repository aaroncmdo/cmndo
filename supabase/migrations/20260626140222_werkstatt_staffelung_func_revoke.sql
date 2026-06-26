-- Security: Supabase default privileges auto-GRANT EXECUTE to anon+authenticated on new
-- public functions. REVOKE FROM PUBLIC (prior migration) does NOT remove those explicit
-- role grants. Revoke them so these SECURITY DEFINER functions are not REST-callable by
-- anon/authenticated. The trigger still fires (trigger mechanism is grant-independent);
-- the admin RPC uses service_role (kept). Fixes advisor anon/authenticated_security_definer_function_executable.
REVOKE ALL ON FUNCTION public.award_werkstatt_staffel_boni(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_werkstatt_staffel_boni(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.trg_award_werkstatt_staffel() FROM PUBLIC, anon, authenticated;
