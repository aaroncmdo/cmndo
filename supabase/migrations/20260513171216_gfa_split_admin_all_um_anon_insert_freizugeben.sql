-- DRIFT-RECOVERY (rekonstruiert 13.05.2026 17:18) — Migration appliziert
-- via MCP `apply_migration` ohne lokales Repo-File (Regel-2-Drift).
--
-- Rekonstruktion basiert auf:
--   • Migration-Name: "split_admin_all_um_anon_insert_freizugeben"
--   • Pre-State: 1 Policy `gfa_admin_all` (ALL/public/qual=is_admin)
--   • Post-State: 3 Policies `gfa_admin_{select,update,delete}` (entsprechend split)
--
-- Hintergrund: `gfa_admin_all` als ALL-Policy bedeckte auch INSERT, was den
-- Lead-Capture-Flow (anon füllt das Form unter /gutachter-finden aus) blockierte.
-- Split nach Cmd öffnet INSERT als unbedachten Slot, der dann separat durch
-- `gfa_insert_public` (existierte schon vor dieser Migration) abgedeckt ist.
--
-- Idempotenz: DROP IF EXISTS + CREATE (kein OR REPLACE für Policies).

DROP POLICY IF EXISTS "gfa_admin_all" ON public.gutachter_finder_anfragen;
DROP POLICY IF EXISTS "gfa_admin_select" ON public.gutachter_finder_anfragen;
DROP POLICY IF EXISTS "gfa_admin_update" ON public.gutachter_finder_anfragen;
DROP POLICY IF EXISTS "gfa_admin_delete" ON public.gutachter_finder_anfragen;

CREATE POLICY "gfa_admin_select" ON public.gutachter_finder_anfragen
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.rolle = 'admin'::user_role
    )
  );

CREATE POLICY "gfa_admin_update" ON public.gutachter_finder_anfragen
  FOR UPDATE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.rolle = 'admin'::user_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.rolle = 'admin'::user_role
    )
  );

CREATE POLICY "gfa_admin_delete" ON public.gutachter_finder_anfragen
  FOR DELETE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.rolle = 'admin'::user_role
    )
  );
