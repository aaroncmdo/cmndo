-- AAR-451: RLS-Hardening Wave 2 — is_staff()-Policies rollenspezifisch scopen
--
-- Problem: 23 Tabellen hatten `USING (is_staff())` → jeder Staff-User
-- (admin/kundenbetreuer/leadbearbeiter/dispatch) konnte ALLE Zeilen sehen.
--
-- Lösung:
--   Gruppe A (fall_id-basiert): SELECT via can_access_fall(fall_id) —
--     admin/dispatch: alle Fälle; KB: nur wenn kundenbetreuer_id = auth.uid();
--     LB: nur wenn leadbearbeiter_id = auth.uid() ODER NULL.
--   Gruppe B (tasks): Zusätzlich eigene Tasks über zugewiesen_an/empfaenger_user_id.
--   Gruppe C (leads): LB sieht alle (Inbox), KB nur wenn in faelle zugewiesen.
--   Gruppe D (Admin/Dispatch-only): nur noch admin+dispatch Vollzugriff.
--
-- Kanzlei/SV/Kunden-Policies bleiben bestehen, Service-Role bypass wie gehabt.

-- =====================================================================
-- 1) Scoping-Helper: can_access_fall(fall_id)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.can_access_fall(p_fall_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Admin/Dispatch: alle Fälle
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND rolle IN ('admin', 'dispatch')
    )
    OR
    -- Kundenbetreuer: nur zugewiesene Fälle
    EXISTS (
      SELECT 1 FROM faelle f
      JOIN profiles p ON p.id = auth.uid()
      WHERE f.id = p_fall_id
        AND p.rolle = 'kundenbetreuer'
        AND f.kundenbetreuer_id = auth.uid()
    )
    OR
    -- Leadbearbeiter: eigene + unzugewiesene Fälle
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

-- =====================================================================
-- GRUPPE A — fall_id-scoped Policies
-- =====================================================================

-- fall_dokumente
DROP POLICY IF EXISTS "Mitarbeiter fall_dokumente" ON public.fall_dokumente;
CREATE POLICY "staff_fall_scoped" ON public.fall_dokumente
  FOR ALL TO authenticated
  USING (can_access_fall(fall_id))
  WITH CHECK (can_access_fall(fall_id));

-- pflichtdokumente
DROP POLICY IF EXISTS "Mitarbeiter pflichtdokumente" ON public.pflichtdokumente;
CREATE POLICY "staff_fall_scoped" ON public.pflichtdokumente
  FOR ALL TO authenticated
  USING (can_access_fall(fall_id))
  WITH CHECK (can_access_fall(fall_id));

-- nachrichten (Staff-Policy ersetzen; Kunde/Gutachter/Admin-Policies bleiben)
DROP POLICY IF EXISTS "Mitarbeiter nachrichten" ON public.nachrichten;
CREATE POLICY "staff_fall_scoped" ON public.nachrichten
  FOR ALL TO authenticated
  USING (can_access_fall(fall_id))
  WITH CHECK (can_access_fall(fall_id));

-- parteien
DROP POLICY IF EXISTS "Mitarbeiter parteien" ON public.parteien;
CREATE POLICY "staff_fall_scoped" ON public.parteien
  FOR ALL TO authenticated
  USING (can_access_fall(fall_id))
  WITH CHECK (can_access_fall(fall_id));

-- qc_checkliste
DROP POLICY IF EXISTS "Mitarbeiter qc_checkliste" ON public.qc_checkliste;
CREATE POLICY "staff_fall_scoped" ON public.qc_checkliste
  FOR ALL TO authenticated
  USING (can_access_fall(fall_id))
  WITH CHECK (can_access_fall(fall_id));

-- reklamationen (sv_own_read bleibt, is_staff() dort durch can_access_fall ersetzen)
DROP POLICY IF EXISTS "Mitarbeiter reklamationen" ON public.reklamationen;
DROP POLICY IF EXISTS "sv_own_read" ON public.reklamationen;
CREATE POLICY "staff_fall_scoped" ON public.reklamationen
  FOR ALL TO authenticated
  USING (can_access_fall(fall_id))
  WITH CHECK (can_access_fall(fall_id));
CREATE POLICY "sv_own_read" ON public.reklamationen
  FOR SELECT TO authenticated
  USING (gutachter_id = get_sv_id() OR can_access_fall(fall_id));

-- schadenspositionen
DROP POLICY IF EXISTS "Mitarbeiter schadenspositionen" ON public.schadenspositionen;
CREATE POLICY "staff_fall_scoped" ON public.schadenspositionen
  FOR ALL TO authenticated
  USING (can_access_fall(fall_id))
  WITH CHECK (can_access_fall(fall_id));

-- timeline
DROP POLICY IF EXISTS "Mitarbeiter timeline" ON public.timeline;
CREATE POLICY "staff_fall_scoped" ON public.timeline
  FOR ALL TO authenticated
  USING (can_access_fall(fall_id))
  WITH CHECK (can_access_fall(fall_id));

-- zahlungseingaenge
DROP POLICY IF EXISTS "Mitarbeiter zahlungseingaenge" ON public.zahlungseingaenge;
CREATE POLICY "staff_fall_scoped" ON public.zahlungseingaenge
  FOR ALL TO authenticated
  USING (can_access_fall(fall_id))
  WITH CHECK (can_access_fall(fall_id));

-- zahlungspositionen
DROP POLICY IF EXISTS "Mitarbeiter zahlungspositionen" ON public.zahlungspositionen;
CREATE POLICY "staff_fall_scoped" ON public.zahlungspositionen
  FOR ALL TO authenticated
  USING (can_access_fall(fall_id))
  WITH CHECK (can_access_fall(fall_id));

-- forderungspositionen (is_kanzlei() bleibt — Kanzlei darf weiterhin alle Forderungen lesen)
DROP POLICY IF EXISTS "Mitarbeiter forderungspositionen" ON public.forderungspositionen;
CREATE POLICY "staff_fall_scoped" ON public.forderungspositionen
  FOR ALL TO authenticated
  USING (can_access_fall(fall_id) OR is_kanzlei())
  WITH CHECK (can_access_fall(fall_id) OR is_kanzlei());

-- abrechnung_positionen
DROP POLICY IF EXISTS "staff_access" ON public.abrechnung_positionen;
CREATE POLICY "staff_fall_scoped" ON public.abrechnung_positionen
  FOR ALL TO authenticated
  USING (can_access_fall(fall_id))
  WITH CHECK (can_access_fall(fall_id));

-- calls (fall_id direkt vorhanden; lead_id wird via faelle nicht abgedeckt → LB-Inbox-Leads bleiben über leads-Policy, calls.fall_id=NULL bei reinen Lead-Calls → admin/dispatch sehen über Sonder-Policy)
DROP POLICY IF EXISTS "staff_access" ON public.calls;
CREATE POLICY "staff_fall_scoped" ON public.calls
  FOR ALL TO authenticated
  USING (
    -- Fall-Call: über can_access_fall
    (fall_id IS NOT NULL AND can_access_fall(fall_id))
    OR
    -- Lead-Call oder unverknüpft: admin/dispatch/leadbearbeiter dürfen sehen
    (fall_id IS NULL AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter')
    ))
  )
  WITH CHECK (
    (fall_id IS NOT NULL AND can_access_fall(fall_id))
    OR
    (fall_id IS NULL AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter')
    ))
  );

-- call_copilot_suggestions (über call_id → calls.fall_id)
DROP POLICY IF EXISTS "staff_access" ON public.call_copilot_suggestions;
CREATE POLICY "staff_fall_scoped" ON public.call_copilot_suggestions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM calls c
      WHERE c.id = call_copilot_suggestions.call_id
        AND (
          (c.fall_id IS NOT NULL AND can_access_fall(c.fall_id))
          OR
          (c.fall_id IS NULL AND EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter')
          ))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM calls c
      WHERE c.id = call_copilot_suggestions.call_id
        AND (
          (c.fall_id IS NOT NULL AND can_access_fall(c.fall_id))
          OR
          (c.fall_id IS NULL AND EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter')
          ))
        )
    )
  );

-- call_transcription_utterances (über call_id → calls.fall_id)
DROP POLICY IF EXISTS "staff_access" ON public.call_transcription_utterances;
CREATE POLICY "staff_fall_scoped" ON public.call_transcription_utterances
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM calls c
      WHERE c.id = call_transcription_utterances.call_id
        AND (
          (c.fall_id IS NOT NULL AND can_access_fall(c.fall_id))
          OR
          (c.fall_id IS NULL AND EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter')
          ))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM calls c
      WHERE c.id = call_transcription_utterances.call_id
        AND (
          (c.fall_id IS NOT NULL AND can_access_fall(c.fall_id))
          OR
          (c.fall_id IS NULL AND EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter')
          ))
        )
    )
  );

-- ki_gespraeche (staff all → fall_scoped; Kunde-Policies bleiben)
DROP POLICY IF EXISTS "ki_gespraeche_staff_all" ON public.ki_gespraeche;
CREATE POLICY "ki_gespraeche_staff_fall_scoped" ON public.ki_gespraeche
  FOR ALL TO authenticated
  USING (
    -- Staff mit Fall-Zugriff, oder Staff ohne fall_id (z. B. globale KI-Logs) → admin/dispatch
    (fall_id IS NOT NULL AND can_access_fall(fall_id))
    OR
    (fall_id IS NULL AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')
    ))
  )
  WITH CHECK (
    (fall_id IS NOT NULL AND can_access_fall(fall_id))
    OR
    (fall_id IS NULL AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')
    ))
  );

-- =====================================================================
-- GRUPPE B — tasks (fall_id + empfaenger_user_id + zugewiesen_an)
-- =====================================================================
DROP POLICY IF EXISTS "Mitarbeiter tasks" ON public.tasks;
CREATE POLICY "staff_fall_scoped" ON public.tasks
  FOR ALL TO authenticated
  USING (
    -- Fall-bezogene Task: über can_access_fall
    (fall_id IS NOT NULL AND can_access_fall(fall_id))
    OR
    -- Lead-bezogene Task: LB/Admin/Dispatch
    (fall_id IS NULL AND lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter')
    ))
    OR
    -- Eigene Tasks: Empfänger/Zugewiesener darf immer sehen
    zugewiesen_an = auth.uid()
    OR
    empfaenger_user_id = auth.uid()
    OR
    -- Standalone-Tasks ohne fall_id + lead_id: admin/dispatch
    (fall_id IS NULL AND lead_id IS NULL AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')
    ))
  )
  WITH CHECK (
    (fall_id IS NOT NULL AND can_access_fall(fall_id))
    OR
    (fall_id IS NULL AND lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter')
    ))
    OR
    zugewiesen_an = auth.uid()
    OR
    empfaenger_user_id = auth.uid()
    OR
    (fall_id IS NULL AND lead_id IS NULL AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')
    ))
  );

-- =====================================================================
-- GRUPPE C — leads (LB sieht alles, KB nur via faelle)
-- =====================================================================
DROP POLICY IF EXISTS "Mitarbeiter leads" ON public.leads;
CREATE POLICY "staff_role_scoped" ON public.leads
  FOR ALL TO authenticated
  USING (
    -- Admin/Dispatch/LB: alle Leads (Inbox-Bedarf)
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter')
    )
    OR
    -- KB: nur Leads, die zu einem ihm zugewiesenen Fall gehören
    EXISTS (
      SELECT 1 FROM faelle f
      JOIN profiles p ON p.id = auth.uid()
      WHERE f.lead_id = leads.id
        AND p.rolle = 'kundenbetreuer'
        AND f.kundenbetreuer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND rolle IN ('admin','dispatch','leadbearbeiter')
    )
    OR
    EXISTS (
      SELECT 1 FROM faelle f
      JOIN profiles p ON p.id = auth.uid()
      WHERE f.lead_id = leads.id
        AND p.rolle = 'kundenbetreuer'
        AND f.kundenbetreuer_id = auth.uid()
    )
  );

-- =====================================================================
-- GRUPPE D — Admin/Dispatch-only (KB/LB nicht nötig)
-- =====================================================================

-- admin_termine
DROP POLICY IF EXISTS "staff_access" ON public.admin_termine;
CREATE POLICY "admin_dispatch_access" ON public.admin_termine
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch'))
    OR zugewiesen_an = auth.uid()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch'))
    OR zugewiesen_an = auth.uid()
  );

-- aircall_relay_seats
DROP POLICY IF EXISTS "staff_access" ON public.aircall_relay_seats;
CREATE POLICY "admin_dispatch_access" ON public.aircall_relay_seats
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')));

-- dokumente — "Mitarbeiter dokumente" (is_staff ALL) → fall-scoped
DROP POLICY IF EXISTS "Mitarbeiter dokumente" ON public.dokumente;
CREATE POLICY "staff_fall_scoped" ON public.dokumente
  FOR ALL TO authenticated
  USING (
    fall_id IS NOT NULL AND can_access_fall(fall_id)
    OR
    (fall_id IS NULL AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')
    ))
  )
  WITH CHECK (
    fall_id IS NOT NULL AND can_access_fall(fall_id)
    OR
    (fall_id IS NULL AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')
    ))
  );

-- gutachter_termine (Staff-Policy → fall-scoped; SV/Kunde/Admin-Policies bleiben)
DROP POLICY IF EXISTS "Mitarbeiter gutachter_termine" ON public.gutachter_termine;
CREATE POLICY "staff_fall_scoped" ON public.gutachter_termine
  FOR ALL TO authenticated
  USING (
    fall_id IS NOT NULL AND can_access_fall(fall_id)
    OR
    (fall_id IS NULL AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')
    ))
  )
  WITH CHECK (
    fall_id IS NOT NULL AND can_access_fall(fall_id)
    OR
    (fall_id IS NULL AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')
    ))
  );

-- kanzleien — staff_read → admin/dispatch read
DROP POLICY IF EXISTS "staff_read" ON public.kanzleien;
CREATE POLICY "admin_dispatch_read" ON public.kanzleien
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')));

-- kanzlei_abrechnungen — staff_read → admin/dispatch read
DROP POLICY IF EXISTS "staff_read" ON public.kanzlei_abrechnungen;
CREATE POLICY "admin_dispatch_read" ON public.kanzlei_abrechnungen
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')));

-- kanzlei_abrechnung_positionen — staff_read → admin/dispatch read
DROP POLICY IF EXISTS "staff_read" ON public.kanzlei_abrechnung_positionen;
CREATE POLICY "admin_dispatch_read" ON public.kanzlei_abrechnung_positionen
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')));

-- sachverstaendige — "Mitarbeiter sachverstaendige" (is_staff SELECT) → admin/dispatch SELECT
DROP POLICY IF EXISTS "Mitarbeiter sachverstaendige" ON public.sachverstaendige;
CREATE POLICY "admin_dispatch_read" ON public.sachverstaendige
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch')));

-- =====================================================================
-- Ende AAR-451
-- =====================================================================
