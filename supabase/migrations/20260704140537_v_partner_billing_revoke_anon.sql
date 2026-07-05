-- SICHERHEIT (Release-Totalblocker-Fix): v_partner_billing ist admin-only, aber Supabase-Default-
-- Privileges (ALTER DEFAULT PRIVILEGES ... GRANT SELECT ON TABLES TO anon/authenticated) granten
-- neu erstellten Views in public automatisch anon+authenticated SELECT. Bei security_invoker greift
-- zwar Base-RLS, aber anon konnte real 12 Zeilen Partner-Abrechnungsdaten lesen (MCP-verifiziert) —
-- LIVE-Leak, der zusaetzlich check-claim-view-rls.mjs (empirischer Build-Gate gg prod) rot machte
-- und damit JEDEN PR-Build blockierte. Vollstaendig entziehen; nur der Admin-Client (service_role)
-- hinter dem rolle='admin'-Route-Guard liest die View.
REVOKE ALL ON public.v_partner_billing FROM anon;
REVOKE ALL ON public.v_partner_billing FROM authenticated;
GRANT SELECT ON public.v_partner_billing TO service_role;
