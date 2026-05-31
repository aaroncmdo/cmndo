-- CMM-49 RLS: die 3 letzten can_access_fall-Policies (Batch-C-Tische, jetzt mit claim_id) -> can_access_claim.
-- Aequivalenz live bewiesen (claim_id == Claim des fall_id, viol=0). Danach: can_access_fall hat 0 Policy-Consumer
-- => faelle-RLS komplett claim_id-basiert. tasks: nur can_access_fall(fall_id)->can_access_claim(claim_id)
-- getauscht, alle anderen Legs (is_admin/lead_id-Branches/zugewiesen_an/empfaenger_user_id) verbatim.
SET LOCAL lock_timeout = '8s';

ALTER POLICY staff_fall_scoped ON public.parteien
  USING (can_access_claim(claim_id)) WITH CHECK (can_access_claim(claim_id));

ALTER POLICY staff_fall_scoped ON public.nachrichten
  USING (can_access_claim(claim_id)) WITH CHECK (can_access_claim(claim_id));

ALTER POLICY tasks_all_public_consol ON public.tasks USING (
  is_admin() OR (
    ((fall_id IS NOT NULL) AND can_access_claim(claim_id))
    OR ((fall_id IS NULL) AND (lead_id IS NOT NULL) AND (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]))))
    OR (zugewiesen_an = (SELECT auth.uid()))
    OR (empfaenger_user_id = (SELECT auth.uid()))
    OR ((fall_id IS NULL) AND (lead_id IS NULL) AND (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]))))
  )
);
