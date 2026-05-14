-- Performance — leads PERMISSIVE-Policy-Konsolidierung.
--
-- Audit: docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13.md (LOW §4.2)
--
-- 9 → 6 Policies (3 Slot-Konsolidierungen):
--   ALL/public (2→1): Admins + staff_role_scoped
--   SELECT/public (2→1): Kanzlei + KB-via-claim
--   SELECT/authenticated (2→1): makler + sv

DROP POLICY IF EXISTS "Admins full access" ON public.leads;
DROP POLICY IF EXISTS "staff_role_scoped" ON public.leads;

CREATE POLICY "leads_staff_all_consolidated" ON public.leads
  FOR ALL TO public
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.faelle f
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE f.lead_id = leads.id
        AND p.rolle = 'kundenbetreuer'::user_role
        AND f.kundenbetreuer_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.faelle f
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE f.lead_id = leads.id
        AND p.rolle = 'kundenbetreuer'::user_role
        AND f.kundenbetreuer_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Kanzlei liest konvertierte leads" ON public.leads;
DROP POLICY IF EXISTS "leads_kb_via_claim_select" ON public.leads;

CREATE POLICY "leads_kanzlei_kb_select_consolidated" ON public.leads
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.faelle
      JOIN public.profiles ON profiles.id = (SELECT auth.uid())
      WHERE faelle.lead_id = leads.id
        AND profiles.rolle = 'kanzlei'::user_role
        AND faelle.service_typ = 'komplett'::text
    )
    OR EXISTS (
      SELECT 1 FROM public.claims c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE c.lead_id = leads.id
        AND p.rolle = 'kundenbetreuer'::user_role
        AND c.kundenbetreuer_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "leads_makler_read" ON public.leads;
DROP POLICY IF EXISTS "leads_sv_read" ON public.leads;

CREATE POLICY "leads_makler_sv_select_consolidated" ON public.leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.promotion_codes pc
      JOIN public.makler m ON m.id = pc.makler_id
      WHERE pc.id = leads.promotion_code_id
        AND m.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.faelle f
      JOIN public.sachverstaendige sv ON sv.id = f.sv_id
      JOIN public.profiles p ON p.id = sv.profile_id
      WHERE f.lead_id = leads.id
        AND p.id = (SELECT auth.uid())
        AND p.rolle = 'sachverstaendiger'::user_role
    )
  );
