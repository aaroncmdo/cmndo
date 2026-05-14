-- AAR vertragsvorlagen-Scope-Lock — Audit 2.2b (13.05.2026)
--
-- Vorher: `auth_read` Policy mit `qual=true` → jeder authenticated User
-- (Kunde, Makler, Kanzlei, SV) konnte ALLE Vertragsvorlagen-Versionen lesen,
-- inkl. inaktive Drafts und non-public Klauseln.
--
-- Konsumenten heute (rg vertragsvorlagen src/):
--   - src/lib/contracts/sign-and-store.ts        → createAdminClient (Service-Role) ✓
--   - src/lib/actions/sv-onboarding-actions.ts   → createAdminClient ✓
--   - src/app/admin/einstellungen/vertraege/*    → admin-Pfad
--   - src/app/api/cron/db-backup/route.ts        → Cron, Service-Role
--   - src/app/gutachter/willkommen/{page,actions}.ts → createClient + createAdminClient
--     • actions.ts läuft mit createAdminClient (Service-Role)
--     • page.tsx liest mit createClient (RLS-respect) — braucht SV-Read auf
--       aktiv=true-Vorlagen damit Onboarding-Checkbox-Liste rendert
--
-- Neu:
--   • Staff (admin/dispatch/kundenbetreuer) liest alles (Management-View).
--   • SV (onboarding läuft mit rolle='sachverstaendiger') liest nur aktiv=true
--     Vorlagen.
--   • Kunde/Makler/Kanzlei sehen nichts mehr (kein App-Pfad braucht das).

DROP POLICY IF EXISTS "auth_read" ON public.vertragsvorlagen;

CREATE POLICY "vertragsvorlagen_staff_read"
  ON public.vertragsvorlagen
  FOR SELECT TO authenticated
  USING (is_staff());

CREATE POLICY "vertragsvorlagen_sv_active_read"
  ON public.vertragsvorlagen
  FOR SELECT TO authenticated
  USING (is_sv() AND aktiv = true);

COMMENT ON POLICY "vertragsvorlagen_staff_read" ON public.vertragsvorlagen IS
  'Admin/Dispatch/Kundenbetreuer dürfen alle Vorlagen-Versionen sehen (Management). Audit 2.2b 13.05.2026.';

COMMENT ON POLICY "vertragsvorlagen_sv_active_read" ON public.vertragsvorlagen IS
  'SVs (auch in Onboarding) lesen nur aktiv=true Vorlagen (Nutzungsbedingungen + Kollegen-Vorlage in /gutachter/willkommen). Audit 2.2b 13.05.2026.';
