-- Lead-Audit 20.05.2026 — RLS-Quick-Smoke leads.
-- service_role-Baseline + RLS-Verhalten als anon + authenticated (ohne JWT-Claims).
-- Erwartung: nach AAR-888-Konsolidierung sehen anon + authenticated-ohne-Membership 0 Leads.
-- Audit-Datei: docs/20.05.2026/lead-audit-vertikal-horizontal.md §3.1

-- Baseline: service_role sieht alle Leads
SELECT 'service_role' AS role, count(*) AS visible_leads, count(*) FILTER (WHERE source_channel IS NULL) AS leads_with_null_source FROM public.leads;

-- Als anon (nicht eingeloggter Public-Visitor)
SET LOCAL ROLE anon;
SELECT 'anon' AS role, count(*) AS visible_leads FROM public.leads;
RESET ROLE;

-- Als authenticated ohne JWT-Claims (eingeloggter User ohne profiles.rolle-Membership)
SET LOCAL ROLE authenticated;
SELECT 'authenticated_no_jwt' AS role, count(*) AS visible_leads FROM public.leads;
RESET ROLE;
