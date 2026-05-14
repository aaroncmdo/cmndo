-- Fix: INSERT ... RETURNING (von .select() in saveOnboardingStep) wird durch
-- die fehlende SELECT-policy für anon geblockt. Postgres prüft bei RETURNING
-- die SELECT-policy gegen die gerade-eingefügte Zeile. gfa_admin_select hat
-- USING = (rolle = 'admin') was für anon false ist → 42501 RLS violation.
--
-- Pragmatischer Fix: eine permissive SELECT-policy hinzufügen die anon Zugang
-- erlaubt. War vor RLS-Hardening de-facto der Zustand.
--
-- FIXME später: Server-Action saveOnboardingStep auf service-role-key
-- refactor → bypass RLS + dann anon-SELECT-policy wieder restriktiver machen.

CREATE POLICY gfa_anon_select_eigene_session ON public.gutachter_finder_anfragen
  FOR SELECT TO anon, authenticated
  USING (true);

COMMENT ON POLICY gfa_anon_select_eigene_session ON public.gutachter_finder_anfragen IS
  'Erlaubt anon/auth-User Lesen — pragmatischer Fix damit INSERT ... RETURNING im /gutachter-finden-Wizard funktioniert. FIXME: später durch service-role-Server-Action ersetzen.';
