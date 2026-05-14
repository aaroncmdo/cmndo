-- Performance — faelle PERMISSIVE-Policy-Konsolidierung.
--
-- Audit: docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13.md (LOW §4.2)
--
-- Konsolidiert die 9 faelle-Policies in 5, indem die zwei redundanten
-- PERMISSIVE-Slots (ALL/public, SELECT/public) je zu 1 Policy gemergt
-- werden. Semantisch identisch zu vorher (Postgres OR-verkettet bei
-- PERMISSIVE eh), aber Plan-Cost-günstiger weil 1 statt 3 pro Slot.
--
-- Slot ALL/public (3 → 1):
--   • Admins full access (qual=is_admin())
--   • Dispatch full access faelle
--   • KB sieht nur zugewiesene Faelle
--
-- Slot SELECT/public (3 → 1):
--   • Kanzlei sieht komplett-Pakete
--   • Kunden eigene Faelle
--   • SV zugewiesene Faelle
--
-- Behalten unverändert (eigene Slots, kein Merge nötig):
--   • Flow anon insert faelle (INSERT/anon)
--   • Anon sign faelle (UPDATE/anon)
--   • faelle_makler_read (SELECT/authenticated)

-- ALL/public-Slot
DROP POLICY IF EXISTS "Admins full access" ON public.faelle;
DROP POLICY IF EXISTS "Dispatch full access faelle" ON public.faelle;
DROP POLICY IF EXISTS "KB sieht nur zugewiesene Faelle" ON public.faelle;

CREATE POLICY "faelle_staff_all_consolidated" ON public.faelle
  FOR ALL TO public
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.rolle = 'dispatch'::user_role
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.rolle = 'kundenbetreuer'::user_role
      )
      AND kundenbetreuer_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.rolle = 'dispatch'::user_role
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.rolle = 'kundenbetreuer'::user_role
      )
      AND kundenbetreuer_id = (SELECT auth.uid())
    )
  );

-- SELECT/public-Slot
DROP POLICY IF EXISTS "Kanzlei sieht komplett-Pakete" ON public.faelle;
DROP POLICY IF EXISTS "Kunden eigene Faelle" ON public.faelle;
DROP POLICY IF EXISTS "SV zugewiesene Faelle" ON public.faelle;

CREATE POLICY "faelle_kunde_sv_kanzlei_select_consolidated" ON public.faelle
  FOR SELECT TO public
  USING (
    (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.rolle = 'kanzlei'::user_role
      )
      AND service_typ = 'komplett'::text
    )
    OR kunde_id = (SELECT auth.uid())
    OR sv_id IN (
      SELECT sachverstaendige.id
      FROM public.sachverstaendige
      WHERE sachverstaendige.profile_id = (SELECT auth.uid())
    )
  );
