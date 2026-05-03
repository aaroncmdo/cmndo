-- CMM-19 v2: claims-Policies auf SECURITY DEFINER Helpers umschreiben.
--
-- v1 (cmm19_fix_rls_recursion) hat nur claims_kunde_via_party_select und
-- cp_co_party_select gefixt. Recursion bestand weiter weil:
--   claims_admin_all / claims_kb_own_or_pool / claims_dispatcher_audit
--   nutzen `EXISTS FROM profiles WHERE rolle = '...'` direkt — und die
--   profiles-Subquery wird in einigen Postgres-Plan-Pfaden so evaluiert
--   dass sie wieder claims-Auswertung triggert (RLS-Cycle).
--
-- Lösung: zwei neue SECURITY DEFINER Helpers analog zu is_admin/is_staff/
-- is_sv: is_dispatcher() und is_kundenbetreuer(). Alle claims-Policies
-- werden auf diese Helpers umgestellt.

CREATE OR REPLACE FUNCTION public.is_dispatcher()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND rolle = 'dispatch'::user_role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_kundenbetreuer()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND rolle = 'kundenbetreuer'::user_role
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_dispatcher() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_kundenbetreuer() TO authenticated;

-- ─── claims-Policies neu schreiben ──────────────────────────────────────

DROP POLICY IF EXISTS claims_admin_all ON claims;
CREATE POLICY claims_admin_all ON claims
  FOR ALL USING (is_admin());

DROP POLICY IF EXISTS claims_kb_own_or_pool ON claims;
CREATE POLICY claims_kb_own_or_pool ON claims
  FOR ALL USING (
    is_kundenbetreuer()
    AND (kundenbetreuer_id = auth.uid() OR kundenbetreuer_id IS NULL)
  );

DROP POLICY IF EXISTS claims_dispatcher_audit ON claims;
CREATE POLICY claims_dispatcher_audit ON claims
  FOR SELECT USING (
    is_dispatcher()
    AND lead_id IN (
      SELECT id FROM leads WHERE konvertiert_durch_user_id = auth.uid()
    )
  );

-- claims_kunde_via_party_select bleibt wie nach v1 (nutzt is_claim_user_party).
-- claims_sv_assigned_select bleibt — kein Recursion-Pfad da.

-- ─── claim_parties cp_staff_all ebenfalls auf Helper ───────────────────
DROP POLICY IF EXISTS cp_staff_all ON claim_parties;
CREATE POLICY cp_staff_all ON claim_parties
  FOR ALL USING (is_admin() OR is_dispatcher() OR is_kundenbetreuer());
