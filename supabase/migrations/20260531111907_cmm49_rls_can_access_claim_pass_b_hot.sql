-- CMM-49 RLS: can_access_fall -> can_access_claim — HEISSER Teil (5 Policies, 939-beruehrte Tische:
-- calls/gutachter_termine/ki_gespraeche/call_copilot_suggestions/call_transcription_utterances).
-- Separat von Teil A wegen Deadlock-Risiko mit parallelen Sessions. can_access_claim wird in A angelegt.
SET LOCAL lock_timeout = '8s';

-- calls (Branch-Form; with_check war null -> nur USING)
ALTER POLICY staff_fall_scoped ON public.calls USING (
  ((claim_id IS NOT NULL) AND can_access_claim(claim_id))
  OR ((claim_id IS NULL) AND (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]))))
);

-- gutachter_termine (Branch-Form; USING + WITH CHECK)
ALTER POLICY staff_fall_scoped ON public.gutachter_termine
  USING (
    ((claim_id IS NOT NULL) AND can_access_claim(claim_id))
    OR ((claim_id IS NULL) AND (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]))))
  )
  WITH CHECK (
    ((claim_id IS NOT NULL) AND can_access_claim(claim_id))
    OR ((claim_id IS NULL) AND (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]))))
  );

-- ki_gespraeche (Branch-Form; USING + WITH CHECK)
ALTER POLICY ki_gespraeche_staff_fall_scoped ON public.ki_gespraeche
  USING (
    ((claim_id IS NOT NULL) AND can_access_claim(claim_id))
    OR ((claim_id IS NULL) AND (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]))))
  )
  WITH CHECK (
    ((claim_id IS NOT NULL) AND can_access_claim(claim_id))
    OR ((claim_id IS NULL) AND (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]))))
  );

-- call_copilot_suggestions via calls.claim_id
ALTER POLICY staff_fall_scoped ON public.call_copilot_suggestions USING (
  EXISTS (SELECT 1 FROM calls c WHERE c.id = call_copilot_suggestions.call_id
    AND (((c.claim_id IS NOT NULL) AND can_access_claim(c.claim_id))
         OR ((c.claim_id IS NULL) AND (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]))))))
);

-- call_transcription_utterances via calls.claim_id
ALTER POLICY staff_fall_scoped ON public.call_transcription_utterances USING (
  EXISTS (SELECT 1 FROM calls c WHERE c.id = call_transcription_utterances.call_id
    AND (((c.claim_id IS NOT NULL) AND can_access_claim(c.claim_id))
         OR ((c.claim_id IS NULL) AND (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]))))))
);
