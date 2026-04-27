-- CMM-19 v3: claims_sv_assigned_select und claims_dispatcher_audit
-- ebenfalls auf SECURITY DEFINER Helpers umstellen.

CREATE OR REPLACE FUNCTION public.is_sv_for_claim(p_claim_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM faelle f
    JOIN sachverstaendige sv ON sv.id = f.sv_id
    WHERE f.claim_id = p_claim_id
      AND sv.profile_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.dispatcher_owns_lead(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM leads
    WHERE id = p_lead_id
      AND konvertiert_durch_user_id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_sv_for_claim(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatcher_owns_lead(uuid) TO authenticated;

DROP POLICY IF EXISTS claims_sv_assigned_select ON claims;
CREATE POLICY claims_sv_assigned_select ON claims
  FOR SELECT USING (is_sv_for_claim(id));

DROP POLICY IF EXISTS claims_dispatcher_audit ON claims;
CREATE POLICY claims_dispatcher_audit ON claims
  FOR SELECT USING (
    is_dispatcher() AND dispatcher_owns_lead(lead_id)
  );

-- claim_parties cp_sv_assigned_select hat dasselbe Problem:
DROP POLICY IF EXISTS cp_sv_assigned_select ON claim_parties;
CREATE POLICY cp_sv_assigned_select ON claim_parties
  FOR SELECT USING (is_sv_for_claim(claim_id));
