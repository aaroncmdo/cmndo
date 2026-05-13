-- Fix: gfa_admin_all (FOR ALL) blockte anon-INSERTs via AND-Semantik. 
-- Bei INSERT werden FOR-ALL- und FOR-INSERT-Policies AND-verknüpft (Postgres §5.9).
-- USING (rolle='admin') für anon = false → wird als WITH CHECK = false gewertet
-- → INSERT blockiert trotz gfa_insert_public WITH CHECK = true.
--
-- Aufgefallen im CJ-Smoke (cj-migration-verify) — Lead-Submit auf
-- /gutachter-finden production-broken.
--
-- Fix: ALL-Policy in drei explizite Policies splitten (SELECT/UPDATE/DELETE).
-- INSERT bleibt unbehelligt von Admin-Logik. Admin behält volle Lese-/Schreib-/
-- Lösch-Rechte über die neuen Policies.

DROP POLICY IF EXISTS gfa_admin_all ON public.gutachter_finder_anfragen;

CREATE POLICY gfa_admin_select ON public.gutachter_finder_anfragen
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = 'admin'::user_role));

CREATE POLICY gfa_admin_update ON public.gutachter_finder_anfragen
  FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = 'admin'::user_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = 'admin'::user_role));

CREATE POLICY gfa_admin_delete ON public.gutachter_finder_anfragen
  FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = 'admin'::user_role));
