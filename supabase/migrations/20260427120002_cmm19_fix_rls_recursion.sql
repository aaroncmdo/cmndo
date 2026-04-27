-- CMM-19: Fix für infinite recursion in claims + claim_parties RLS-Policies.
--
-- Vorher:
--   claims_kunde_via_party_select prüft EXISTS gegen claim_parties.
--   cp_co_party_select prüft EXISTS gegen claim_parties (Self-Join).
--   → Postgres evaluiert die innere Policy rekursiv beim EXISTS-Subquery
--     was zur "infinite recursion detected in policy"-Exception führt.
--
-- Lösung: SECURITY DEFINER Helper-Function die RLS auf der innersten
-- Tabelle bypassed. Die äußeren Policies rufen die Function, statt
-- direkt EXISTS-Subqueries auf die gleiche Tabelle zu nutzen.

CREATE OR REPLACE FUNCTION public.is_claim_user_party(p_claim_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM claim_parties cp
    WHERE cp.claim_id = p_claim_id
      AND cp.user_id = auth.uid()
      AND cp.ist_aktiv = true
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_claim_user_party(uuid) TO authenticated;

DROP POLICY IF EXISTS claims_kunde_via_party_select ON claims;

CREATE POLICY claims_kunde_via_party_select
  ON claims
  FOR SELECT
  USING (
    geschaedigter_user_id = auth.uid()
    OR verursacher_user_id = auth.uid()
    OR public.is_claim_user_party(id)
  );

DROP POLICY IF EXISTS cp_co_party_select ON claim_parties;

CREATE POLICY cp_co_party_select
  ON claim_parties
  FOR SELECT
  USING (
    public.is_claim_user_party(claim_id)
  );

COMMENT ON FUNCTION public.is_claim_user_party IS
  'CMM-19: SECURITY DEFINER bypass für claim_parties-Policy-Recursion.';
