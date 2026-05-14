-- RLS-Hardening Phase 2 — lead_historie lock.
--
-- Audit: docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13.md (HIGH §2.2)
--
-- Vorher: 2 Policies
--   • "Authenticated users can insert lead_historie" — INSERT/authenticated/wc=true
--     → jeder eingeloggte User konnte fake-Historie für beliebige Leads schreiben.
--   • "Authenticated users can read lead_historie" — SELECT/authenticated/qual=true
--     → jeder eingeloggte User konnte Lead-Audit-Trail aller Leads lesen.
--
-- Caller-Befund (Sweep 13.05.2026):
--   Keine cookie-authenticated Reads in src/. Inserts in
--   api/admin/create-test-fall (Seed) und Cleanup in _actions/core.ts laufen
--   beide über createAdminClient → service_role-bypass.
--   e2e-reset.mjs nutzt ebenfalls service-key.
--   → Sicher beide Policies ersatzlos zu entfernen.
--
-- Nachher: 0 Policies — RLS-an + keine Policy = service_role-only zugänglich.

DROP POLICY IF EXISTS "Authenticated users can insert lead_historie" ON public.lead_historie;
DROP POLICY IF EXISTS "Authenticated users can read lead_historie" ON public.lead_historie;

-- Rollback-Snippet (NICHT als Migration applied):
--
-- CREATE POLICY "Authenticated users can insert lead_historie" ON public.lead_historie
--   FOR INSERT TO authenticated WITH CHECK (true);
-- CREATE POLICY "Authenticated users can read lead_historie" ON public.lead_historie
--   FOR SELECT TO authenticated USING (true);
