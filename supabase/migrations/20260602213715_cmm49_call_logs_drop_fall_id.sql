-- CMM-49 Drop-Runway Phase "a" (Call-Logs): aircall_calls/calls/matelso_calls von faelle entkoppeln.
-- "b"-Reader/Writer-Repoint (#2290) ist in main/Prod -> kein deployter Code liest fall_id. 0-Row, claim_id da.
--
-- REPLAY-SAFETY (LIVE!=REPLAY, hart gelernt): die Baseline hat 3 RLS-Policies die calls.fall_id
-- referenzieren — calls.staff_fall_scoped (direkt) + call_copilot_suggestions/
-- call_transcription_utterances staff_fall_scoped (via Subquery `FROM calls c ... c.fall_id`).
-- Eine Policy auf Tabelle B die A.fall_id referenziert blockt `ALTER A DROP COLUMN fall_id`.
-- Auf LIVE waren die 3 untracked auf claim_id repointet (daher ging der Live-Drop), aber Fresh-
-- Replay erstellt die Baseline-fall_id-Versionen -> DROP COLUMN scheitert. Daher hier die 3
-- Policies idempotent auf ihren LIVE-claim_id-Stand repointen VOR dem Drop.
-- can_access_claim ist getrackt (eingebettet in 20260602125054, laeuft vor dieser Migration).
-- delete_fall_komplett referenziert die Call-Tabellen NICHT -> keine Fn-Surgery noetig.
-- link_lead_data_to_fall (einziger Fn-Writer von calls.fall_id) ist in 20260602215635 repointet.

-- 1) Policy-Repoints (idempotent) ------------------------------------------------------------
DROP POLICY IF EXISTS staff_fall_scoped ON public.calls;
CREATE POLICY staff_fall_scoped ON public.calls FOR ALL TO public
  USING (
    ((claim_id IS NOT NULL) AND can_access_claim(claim_id))
    OR ((claim_id IS NULL) AND (EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]))))
  );

DROP POLICY IF EXISTS staff_fall_scoped ON public.call_copilot_suggestions;
CREATE POLICY staff_fall_scoped ON public.call_copilot_suggestions FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM calls c
    WHERE c.id = call_copilot_suggestions.call_id
      AND (((c.claim_id IS NOT NULL) AND can_access_claim(c.claim_id))
        OR ((c.claim_id IS NULL) AND (EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = (SELECT auth.uid())
            AND profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role])))))));

DROP POLICY IF EXISTS staff_fall_scoped ON public.call_transcription_utterances;
CREATE POLICY staff_fall_scoped ON public.call_transcription_utterances FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM calls c
    WHERE c.id = call_transcription_utterances.call_id
      AND (((c.claim_id IS NOT NULL) AND can_access_claim(c.claim_id))
        OR ((c.claim_id IS NULL) AND (EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = (SELECT auth.uid())
            AND profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role])))))));

-- 2) Drops (Trigger zuerst; FK + Index fallen mit der Spalte) ---------------------------------
DROP TRIGGER IF EXISTS trg_derive_claim_id ON public.aircall_calls;
ALTER TABLE public.aircall_calls DROP COLUMN fall_id;
DROP TRIGGER IF EXISTS trg_derive_claim_id ON public.calls;
ALTER TABLE public.calls DROP COLUMN fall_id;
DROP TRIGGER IF EXISTS trg_derive_claim_id ON public.matelso_calls;
ALTER TABLE public.matelso_calls DROP COLUMN fall_id;
