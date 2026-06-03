-- Audit §7-A (A6): plz_geo_read is byte-identical to plz_geo_read_authenticated
-- (both: SELECT, PERMISSIVE, role authenticated, USING true) -> drop the duplicate.
DROP POLICY IF EXISTS plz_geo_read ON public.plz_geo;

-- Audit §7-A (A7): fix auth_rls_initplan (auth.uid() re-evaluated per row) by wrapping
-- in (select auth.uid()). Predicates are otherwise byte-identical to the live defs.
DROP POLICY IF EXISTS anfragen_select_admin_dispatch ON public.anfragen;
CREATE POLICY anfragen_select_admin_dispatch ON public.anfragen
  FOR SELECT TO authenticated
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]) ));

DROP POLICY IF EXISTS anfragen_update_admin_dispatch ON public.anfragen;
CREATE POLICY anfragen_update_admin_dispatch ON public.anfragen
  FOR UPDATE TO authenticated
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]) ))
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]) ));

DROP POLICY IF EXISTS embed_pos_sv_select ON public.embed_abrechnung_positionen;
CREATE POLICY embed_pos_sv_select ON public.embed_abrechnung_positionen
  FOR SELECT TO authenticated
  USING (embed_site_id IN ( SELECT embed_sites.id FROM embed_sites
    WHERE embed_sites.inhaber_profile_id = (select auth.uid()) ));

DROP POLICY IF EXISTS embed_sites_owner_select ON public.embed_sites;
CREATE POLICY embed_sites_owner_select ON public.embed_sites
  FOR SELECT TO authenticated
  USING (inhaber_profile_id = (select auth.uid()));

DROP POLICY IF EXISTS matelso_calls_staff ON public.matelso_calls;
CREATE POLICY matelso_calls_staff ON public.matelso_calls
  FOR ALL TO public
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.rolle = ANY (ARRAY['admin'::user_role, 'kundenbetreuer'::user_role, 'leadbearbeiter'::user_role, 'dispatch'::user_role]) ));
