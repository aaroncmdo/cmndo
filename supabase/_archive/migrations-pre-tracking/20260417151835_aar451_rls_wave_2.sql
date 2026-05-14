-- AAR-451: RLS-Hardening Wave 2 — is_staff()-Policies rollenspezifisch scopen

CREATE OR REPLACE FUNCTION public.can_access_fall(p_fall_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND rolle IN ('admin', 'dispatch')
    )
    OR
    EXISTS (
      SELECT 1 FROM faelle f
      JOIN profiles p ON p.id = auth.uid()
      WHERE f.id = p_fall_id
        AND p.rolle = 'kundenbetreuer'
        AND f.kundenbetreuer_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM faelle f
      JOIN profiles p ON p.id = auth.uid()
      WHERE f.id = p_fall_id
        AND p.rolle = 'leadbearbeiter'
        AND (f.leadbearbeiter_id = auth.uid() OR f.leadbearbeiter_id IS NULL)
    );
$$;

COMMENT ON FUNCTION public.can_access_fall(uuid) IS
  'AAR-451: RLS-Scoping-Helper — prüft ob auth.uid() auf Fall zugreifen darf. Admin/Dispatch immer, KB/LB nur auf zugewiesene.';

-- GRUPPE A
DROP POLICY IF EXISTS "Mitarbeiter fall_dokumente" ON public.fall_dokumente;
CREATE POLICY "staff_fall_scoped" ON public.fall_dokumente FOR ALL TO authenticated USING (can_access_fall(fall_id)) WITH CHECK (can_access_fall(fall_id));

DROP POLICY IF EXISTS "Mitarbeiter pflichtdokumente" ON public.pflichtdokumente;
CREATE POLICY "staff_fall_scoped" ON public.pflichtdokumente FOR ALL TO authenticated USING (can_access_fall(fall_id)) WITH CHECK (can_access_fall(fall_id));

DROP POLICY IF EXISTS "Mitarbeiter nachrichten" ON public.nachrichten;
CREATE POLICY "staff_fall_scoped" ON public.nachrichten FOR ALL TO authenticated USING (can_access_fall(fall_id)) WITH CHECK (can_access_fall(fall_id));

DROP POLICY IF EXISTS "Mitarbeiter parteien" ON public.parteien;
CREATE POLICY "staff_fall_scoped" ON public.parteien FOR ALL TO authenticated USING (can_access_fall(fall_id)) WITH CHECK (can_access_fall(fall_id));

DROP POLICY IF EXISTS "Mitarbeiter qc_checkliste" ON public.qc_checkliste;
CREATE POLICY "staff_fall_scoped" ON public.qc_checkliste FOR ALL TO authenticated USING (can_access_fall(fall_id)) WITH CHECK (can_access_fall(fall_id));

DROP POLICY IF EXISTS "Mitarbeiter reklamationen" ON public.reklamationen;
DROP POLICY IF EXISTS "sv_own_read" ON public.reklamationen;
CREATE POLICY "staff_fall_scoped" ON public.reklamationen FOR ALL TO authenticated USING (can_access_fall(fall_id)) WITH CHECK (can_access_fall(fall_id));
CREATE POLICY "sv_own_read" ON public.reklamationen FOR SELECT TO authenticated USING (gutachter_id = get_sv_id() OR can_access_fall(fall_id));

DROP POLICY IF EXISTS "Mitarbeiter schadenspositionen" ON public.schadenspositionen;
CREATE POLICY "staff_fall_scoped" ON public.schadenspositionen FOR ALL TO authenticated USING (can_access_fall(fall_id)) WITH CHECK (can_access_fall(fall_id));

DROP POLICY IF EXISTS "Mitarbeiter timeline" ON public.timeline;
CREATE POLICY "staff_fall_scoped" ON public.timeline FOR ALL TO authenticated USING (can_access_fall(fall_id)) WITH CHECK (can_access_fall(fall_id));

DROP POLICY IF EXISTS "Mitarbeiter zahlungseingaenge" ON public.zahlungseingaenge;
CREATE POLICY "staff_fall_scoped" ON public.zahlungseingaenge FOR ALL TO authenticated USING (can_access_fall(fall_id)) WITH CHECK (can_access_fall(fall_id));

DROP POLICY IF EXISTS "Mitarbeiter zahlungspositionen" ON public.zahlungspositionen;
CREATE POLICY "staff_fall_scoped" ON public.zahlungspositionen FOR ALL TO authenticated USING (can_access_fall(fall_id)) WITH CHECK (can_access_fall(fall_id));

DROP POLICY IF EXISTS "Mitarbeiter forderungspositionen" ON public.forderungspositionen;
CREATE POLICY "staff_fall_scoped" ON public.forderungspositionen FOR ALL TO authenticated USING (can_access_fall(fall_id) OR is_kanzlei()) WITH CHECK (can_access_fall(fall_id) OR is_kanzlei());

DROP POLICY IF EXISTS "staff_access" ON public.abrechnung_positionen;
CREATE POLICY "staff_fall_scoped" ON public.abrechnung_positionen FOR ALL TO authenticated USING (can_access_fall(fall_id)) WITH CHECK (can_access_fall(fall_id));

DROP POLICY IF EXISTS "staff_access" ON public.calls;
CREATE POLICY "staff_fall_scoped" ON public.calls FOR ALL TO authenticated
  USING (
    (fall_id IS NOT NULL AND can_access_fall(fall_id))
    OR (fall_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter')))
  )
  WITH CHECK (
    (fall_id IS NOT NULL AND can_access_fall(fall_id))
    OR (fall_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter')))
  );

DROP POLICY IF EXISTS "staff_access" ON public.call_copilot_suggestions;
CREATE POLICY "staff_fall_scoped" ON public.call_copilot_suggestions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM calls c WHERE c.id = call_copilot_suggestions.call_id AND ((c.fall_id IS NOT NULL AND can_access_fall(c.fall_id)) OR (c.fall_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter'))))))
  WITH CHECK (EXISTS (SELECT 1 FROM calls c WHERE c.id = call_copilot_suggestions.call_id AND ((c.fall_id IS NOT NULL AND can_access_fall(c.fall_id)) OR (c.fall_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter'))))));

DROP POLICY IF EXISTS "staff_access" ON public.call_transcription_utterances;
CREATE POLICY "staff_fall_scoped" ON public.call_transcription_utterances FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM calls c WHERE c.id = call_transcription_utterances.call_id AND ((c.fall_id IS NOT NULL AND can_access_fall(c.fall_id)) OR (c.fall_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter'))))))
  WITH CHECK (EXISTS (SELECT 1 FROM calls c WHERE c.id = call_transcription_utterances.call_id AND ((c.fall_id IS NOT NULL AND can_access_fall(c.fall_id)) OR (c.fall_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter'))))));

DROP POLICY IF EXISTS "ki_gespraeche_staff_all" ON public.ki_gespraeche;
CREATE POLICY "ki_gespraeche_staff_fall_scoped" ON public.ki_gespraeche FOR ALL TO authenticated
  USING ((fall_id IS NOT NULL AND can_access_fall(fall_id)) OR (fall_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch'))))
  WITH CHECK ((fall_id IS NOT NULL AND can_access_fall(fall_id)) OR (fall_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch'))));

-- GRUPPE B — tasks
DROP POLICY IF EXISTS "Mitarbeiter tasks" ON public.tasks;
CREATE POLICY "staff_fall_scoped" ON public.tasks FOR ALL TO authenticated
  USING (
    (fall_id IS NOT NULL AND can_access_fall(fall_id))
    OR (fall_id IS NULL AND lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter')))
    OR zugewiesen_an = auth.uid()
    OR empfaenger_user_id = auth.uid()
    OR (fall_id IS NULL AND lead_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')))
  )
  WITH CHECK (
    (fall_id IS NOT NULL AND can_access_fall(fall_id))
    OR (fall_id IS NULL AND lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter')))
    OR zugewiesen_an = auth.uid()
    OR empfaenger_user_id = auth.uid()
    OR (fall_id IS NULL AND lead_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')))
  );

-- GRUPPE C — leads
DROP POLICY IF EXISTS "Mitarbeiter leads" ON public.leads;
CREATE POLICY "staff_role_scoped" ON public.leads FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter'))
    OR EXISTS (SELECT 1 FROM faelle f JOIN profiles p ON p.id = auth.uid() WHERE f.lead_id = leads.id AND p.rolle = 'kundenbetreuer' AND f.kundenbetreuer_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter'))
    OR EXISTS (SELECT 1 FROM faelle f JOIN profiles p ON p.id = auth.uid() WHERE f.lead_id = leads.id AND p.rolle = 'kundenbetreuer' AND f.kundenbetreuer_id = auth.uid())
  );

-- GRUPPE D
DROP POLICY IF EXISTS "staff_access" ON public.admin_termine;
CREATE POLICY "admin_dispatch_access" ON public.admin_termine FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')) OR zugewiesen_an = auth.uid())
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')) OR zugewiesen_an = auth.uid());

DROP POLICY IF EXISTS "staff_access" ON public.aircall_relay_seats;
CREATE POLICY "admin_dispatch_access" ON public.aircall_relay_seats FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')));

DROP POLICY IF EXISTS "Mitarbeiter dokumente" ON public.dokumente;
CREATE POLICY "staff_fall_scoped" ON public.dokumente FOR ALL TO authenticated
  USING ((fall_id IS NOT NULL AND can_access_fall(fall_id)) OR (fall_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch'))))
  WITH CHECK ((fall_id IS NOT NULL AND can_access_fall(fall_id)) OR (fall_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch'))));

DROP POLICY IF EXISTS "Mitarbeiter gutachter_termine" ON public.gutachter_termine;
CREATE POLICY "staff_fall_scoped" ON public.gutachter_termine FOR ALL TO authenticated
  USING ((fall_id IS NOT NULL AND can_access_fall(fall_id)) OR (fall_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch'))))
  WITH CHECK ((fall_id IS NOT NULL AND can_access_fall(fall_id)) OR (fall_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch'))));

DROP POLICY IF EXISTS "staff_read" ON public.kanzleien;
CREATE POLICY "admin_dispatch_read" ON public.kanzleien FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')));

DROP POLICY IF EXISTS "staff_read" ON public.kanzlei_abrechnungen;
CREATE POLICY "admin_dispatch_read" ON public.kanzlei_abrechnungen FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')));

DROP POLICY IF EXISTS "staff_read" ON public.kanzlei_abrechnung_positionen;
CREATE POLICY "admin_dispatch_read" ON public.kanzlei_abrechnung_positionen FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')));

DROP POLICY IF EXISTS "Mitarbeiter sachverstaendige" ON public.sachverstaendige;
CREATE POLICY "admin_dispatch_read" ON public.sachverstaendige FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')));;
