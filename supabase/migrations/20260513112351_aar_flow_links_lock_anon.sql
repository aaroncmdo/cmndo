-- RLS-Hardening Phase 1 — Sub-Plan #3: flow_links Lock.
--
-- Spec: docs/superpowers/specs/2026-05-13-rls-hardening-phase-1-design.md
-- Audit: docs/12.05.2026/SECU/LIVE-SCHEMA-RLS-AUDIT-12.05.2026.md (HIGH #3)
--
-- Vorher: 3 Policies erlaubten anon-SELECT, anon-UPDATE und authenticated-ALL.
-- → Anon-curl mit nur dem öffentlichen apikey dumpte alle Magic-Link-Token
--   inklusive Lead-IDs und Status (Reproduktion in
--   scripts/smoke/rls-phase-1/03-flow-links.sh).
--
-- Nachher: Default-deny. flow_links wird nur noch via service_role-Client
-- gelesen/geschrieben (createServiceClient / createAdminClient). Die App-
-- seitigen Caller wurden im selben PR auf admin-Client umgestellt.
--
-- Smoke: nach Migration zeigt 03-flow-links.sh "ANGRIFF BLOCKIERT".

DROP POLICY IF EXISTS "Anon can read flow_links by token" ON public.flow_links;
DROP POLICY IF EXISTS "Anon can update flow_links" ON public.flow_links;
DROP POLICY IF EXISTS "Authenticated can manage flow_links" ON public.flow_links;

-- RLS bleibt aktiviert; ohne Policies = default-deny für anon + authenticated.
-- service_role bypasst RLS strukturell und braucht keine Policy.

-- Rollback-Snippet (für Notfall, bewusst NICHT als Migration applied):
--
-- CREATE POLICY "Anon can read flow_links by token" ON public.flow_links
--   FOR SELECT TO anon USING (true);
-- CREATE POLICY "Anon can update flow_links" ON public.flow_links
--   FOR UPDATE TO anon USING (true);
-- CREATE POLICY "Authenticated can manage flow_links" ON public.flow_links
--   FOR ALL TO authenticated USING (auth.role() = 'authenticated');
