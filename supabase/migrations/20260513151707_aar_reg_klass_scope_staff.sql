-- RLS-Hardening Phase 2 — regulierungs_klassifizierung scope.
--
-- Audit: docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13.md (HIGH §2.1)
--
-- Vorher: 3 auth-Policies mit qual=true (SELECT/INSERT/UPDATE) + Service-Bypass
--   → jeder eingeloggte User konnte VS-Klassifizierungen (Kürzungs-/Regulierungs-
--     Beträge, interne Notizen, Begründungen des Versicherers) aller Fälle lesen,
--     einfügen, ändern.
--
-- Caller-Befund (Sweep 13.05.2026):
--   admin/statistiken/page.tsx          → cookie-auth (createClient)
--   admin/sachverstaendige/[id]/page.tsx → cookie-auth
--   lib/actions/dispatch-fall-actions.ts → cookie-auth (dispatch-rolle)
--   _actions/kanzlei-paket.ts            → cookie-auth (admin/kb/dispatch in Fallakte)
--   api/seed-testdata/route.ts           → service_role
--   → SELECT/INSERT/UPDATE müssen für staff (admin/kb/dispatch) funktionieren,
--     Service-Role-Bypass bleibt für Cron/Seed.
--
-- Nachher: 3 staff-Policies + Service-Role-Bypass.
--   is_staff() = rolle IN ('admin','kundenbetreuer','dispatch').

DROP POLICY IF EXISTS "Authenticated users can read regulierungs_klassifizierung" ON public.regulierungs_klassifizierung;
DROP POLICY IF EXISTS "Authenticated users can insert regulierungs_klassifizierung" ON public.regulierungs_klassifizierung;
DROP POLICY IF EXISTS "Authenticated users can update regulierungs_klassifizierung" ON public.regulierungs_klassifizierung;

CREATE POLICY "reg_klass_select_staff" ON public.regulierungs_klassifizierung
  FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "reg_klass_insert_staff" ON public.regulierungs_klassifizierung
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "reg_klass_update_staff" ON public.regulierungs_klassifizierung
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- "Service-Role bypass regulierungs_klassifizierung" bleibt unverändert.

-- Rollback-Snippet (NICHT als Migration applied):
--
-- DROP POLICY IF EXISTS "reg_klass_select_staff" ON public.regulierungs_klassifizierung;
-- DROP POLICY IF EXISTS "reg_klass_insert_staff" ON public.regulierungs_klassifizierung;
-- DROP POLICY IF EXISTS "reg_klass_update_staff" ON public.regulierungs_klassifizierung;
-- CREATE POLICY "Authenticated users can read regulierungs_klassifizierung"
--   ON public.regulierungs_klassifizierung FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "Authenticated users can insert regulierungs_klassifizierung"
--   ON public.regulierungs_klassifizierung FOR INSERT TO authenticated WITH CHECK (true);
-- CREATE POLICY "Authenticated users can update regulierungs_klassifizierung"
--   ON public.regulierungs_klassifizierung FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
