-- Anon-Grant-Cap Runde 2 (Boy-Scout aus dem Anon-Grant-Ratchet, PR #4403): die zwei verifiziert
-- server-only Credential-Tabellen. anon hatte einen table-weiten SELECT-Grant (latent — RLS an,
-- 0 anon-SELECT-Policies), der roh OAuth-Tokens bzw. verschluesselte Kalender-Passwoerter
-- exponiert haette, sobald ein anon-Policy-Zweig Zeilen durchlaesst.
--   * linkedin_oauth_tokens: ALLE Consumer = createAdminClient() (service_role, bypasst Grants)
--     — lib/linkedin/token.ts, api/auth/linkedin/callback, admin/marketing/linkedin. Kein anon-Read.
--   * sv_kalender_verbindungen: Legacy-Tabelle (App nutzt kanonisch kalender_verbindungen; die
--     alte hat 0 aktive .from()-Consumer, nur Kommentar-Referenzen). Reines Hardening.
-- Full-Revoke des SELECT, kein Re-Grant (anon liest beide Tabellen nie). authenticated/service_role
-- unberuehrt.
revoke select on public.linkedin_oauth_tokens from anon;
revoke select on public.sv_kalender_verbindungen from anon;
