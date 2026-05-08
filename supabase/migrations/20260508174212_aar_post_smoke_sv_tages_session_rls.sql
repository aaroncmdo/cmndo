-- E2E-Smoke 2026-05-08 (F-14): RLS-Leak auf sv_tages_session.
--
-- Symptom: test-kundenbetreuer (Anna Weber) sah im RLS-Check 10 Zeilen aus
-- sv_tages_session, obwohl KB mit SV-Tagesplanung nichts zu tun hat. Auch
-- andere Rollen ohne Berechtigung hatten Zugriff.
--
-- Ursache: RLS war auf der Tabelle nicht aktiviert. Die in AAR-708 erwähnte
-- Policy `sv_tages_session_sv_own = sv_id = get_sv_id()` ist nur in einem
-- Kommentar referenziert — der CREATE-Statement fehlt im Repo (vermutlich
-- ursprünglich direkt im Studio angelegt → Drift, AAR-600-Klasse).
--
-- Fix: RLS aktivieren + saubere Policy-Set:
--   - SV: SELECT/INSERT/UPDATE/DELETE der eigenen Session (sv_id=get_sv_id())
--   - Admin: Vollzugriff (Audit + Support)
--   - Dispatch: SELECT (Auslastungs-Übersicht im Dispatch-Hub)
--   - KB / Kunde / sonstige: KEINE Policy → kein Zugriff (default-deny)
--
-- Idempotent: existierende Policies werden gedroppt und neu angelegt, RLS-
-- Enable ist idempotent.

ALTER TABLE public.sv_tages_session ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sv_tages_session_sv_own ON public.sv_tages_session;
DROP POLICY IF EXISTS sv_tages_session_sv_select ON public.sv_tages_session;
DROP POLICY IF EXISTS sv_tages_session_sv_modify ON public.sv_tages_session;
DROP POLICY IF EXISTS sv_tages_session_admin_all ON public.sv_tages_session;
DROP POLICY IF EXISTS sv_tages_session_dispatch_select ON public.sv_tages_session;

CREATE POLICY sv_tages_session_sv_own
ON public.sv_tages_session
FOR ALL
TO authenticated
USING (sv_id = public.get_sv_id())
WITH CHECK (sv_id = public.get_sv_id());

COMMENT ON POLICY sv_tages_session_sv_own ON public.sv_tages_session IS
  'Smoke-2026-05-08 F-14: Sachverständiger darf nur seine eigene Tagessession lesen/schreiben.';

CREATE POLICY sv_tages_session_admin_all
ON public.sv_tages_session
FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle = 'admin'::user_role)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle = 'admin'::user_role)
);

COMMENT ON POLICY sv_tages_session_admin_all ON public.sv_tages_session IS
  'Smoke-2026-05-08 F-14: Admin-Vollzugriff für Support, Audit, Reporting.';

CREATE POLICY sv_tages_session_dispatch_select
ON public.sv_tages_session
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rolle = 'dispatch'::user_role)
);

COMMENT ON POLICY sv_tages_session_dispatch_select ON public.sv_tages_session IS
  'Smoke-2026-05-08 F-14: Dispatch sieht alle Tages-Sessions read-only.';
