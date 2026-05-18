-- 2026-05-18: Code-Quality-Review-Fixes zur anfragen-Tabelle.
--
-- 1. disqualifiziert_durch-FK: ON DELETE SET NULL ergänzen (Audit-Attribution
--    soll Account-Löschung nicht blocken — Konvention im Projekt für
--    auth.users-FKs in Audit-Spalten).
-- 2. RLS-Policies neu erstellen mit ::user_role-Casts (Konsistenz mit dem
--    Rest der Codebase, z.B. aar571_phase_transitions, dispatcher-Policies).
--
-- Spec: Code-Quality-Review zu docs/superpowers/plans/2026-05-18-anfragen-inbox-implementation.md T1

-- 1) FK anfragen_disqualifiziert_durch_fkey ON DELETE SET NULL
ALTER TABLE public.anfragen
  DROP CONSTRAINT anfragen_disqualifiziert_durch_fkey;

ALTER TABLE public.anfragen
  ADD CONSTRAINT anfragen_disqualifiziert_durch_fkey
  FOREIGN KEY (disqualifiziert_durch)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- 2) RLS-Policies mit ::user_role-Cast neu erstellen
DROP POLICY anfragen_select_admin_dispatch ON public.anfragen;
DROP POLICY anfragen_update_admin_dispatch ON public.anfragen;

CREATE POLICY anfragen_select_admin_dispatch
  ON public.anfragen
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.rolle IN ('admin'::user_role, 'dispatch'::user_role)
    )
  );

CREATE POLICY anfragen_update_admin_dispatch
  ON public.anfragen
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.rolle IN ('admin'::user_role, 'dispatch'::user_role)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.rolle IN ('admin'::user_role, 'dispatch'::user_role)
    )
  );
