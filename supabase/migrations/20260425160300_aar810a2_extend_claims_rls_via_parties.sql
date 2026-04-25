-- AAR-810 A.2.4: claims_kunde_own_select erweitern auf claim_parties-Lookup

-- Alte Policy droppen (aus AAR-811 / Phase A.1)
DROP POLICY IF EXISTS claims_kunde_own_select ON public.claims;

-- Neue Policy: User sieht claims wenn er als party beteiligt ist (jede Rolle)
CREATE POLICY claims_kunde_via_party_select ON public.claims
  FOR SELECT USING (
    geschaedigter_user_id = auth.uid()
    OR verursacher_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.claim_parties cp
      WHERE cp.claim_id = claims.id
        AND cp.user_id = auth.uid()
        AND cp.ist_aktiv = TRUE
    )
  );

COMMENT ON POLICY claims_kunde_via_party_select ON public.claims IS
  'AAR-810 A.2: Kunde sieht claim wenn er als geschaedigter, verursacher ODER andere claim_parties-Rolle (Beifahrer, Zeuge, gegner_airdrop) beteiligt ist.';
