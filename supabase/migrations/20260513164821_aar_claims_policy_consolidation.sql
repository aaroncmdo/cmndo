-- Performance — claims PERMISSIVE-Policy-Konsolidierung.
--
-- Audit: docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13.md (LOW §4.2)
--
-- 5 → 3 Policies (ALL/public + SELECT/public konsolidiert).
--
-- ALL/public (2 → 1): claims_admin_all + claims_kb_own_or_pool
-- SELECT/public (3 → 1): claims_dispatcher_audit + claims_kunde_via_party_select + claims_sv_assigned_select

DROP POLICY IF EXISTS "claims_admin_all" ON public.claims;
DROP POLICY IF EXISTS "claims_kb_own_or_pool" ON public.claims;

CREATE POLICY "claims_staff_all_consolidated" ON public.claims
  FOR ALL TO public
  USING (
    public.is_admin()
    OR (
      public.is_kundenbetreuer()
      AND (kundenbetreuer_id = (SELECT auth.uid()) OR kundenbetreuer_id IS NULL)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_kundenbetreuer()
      AND (kundenbetreuer_id = (SELECT auth.uid()) OR kundenbetreuer_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "claims_dispatcher_audit" ON public.claims;
DROP POLICY IF EXISTS "claims_kunde_via_party_select" ON public.claims;
DROP POLICY IF EXISTS "claims_sv_assigned_select" ON public.claims;

CREATE POLICY "claims_kunde_sv_dispatch_select_consolidated" ON public.claims
  FOR SELECT TO public
  USING (
    (public.is_dispatcher() AND public.dispatcher_owns_lead(lead_id))
    OR geschaedigter_user_id = (SELECT auth.uid())
    OR verursacher_user_id = (SELECT auth.uid())
    OR public.is_claim_user_party(id)
    OR public.is_sv_for_claim(id)
  );
