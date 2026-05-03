-- AAR-747: leadbearbeiter → dispatch Konsolidierung
--
-- Aaron-Klarstellung (Session 2026-04-24): Dispatcher und Leadbearbeiter
-- sind semantisch dieselbe Rolle (der Dispatcher bearbeitet Leads am Telefon
-- und schließt sie via FlowLink zum Fall ab). Die parallele Rolle
-- 'leadbearbeiter' ist Legacy-Duplikation.
--
-- Prod-Stand vor Migration (2026-04-24):
--   - 0 Profile mit rolle='leadbearbeiter' (bereits clean)
--   - 2 Profile mit rolle='dispatch'
--   - faelle.leadbearbeiter_id FK-Spalte noch vorhanden (uuid, nullable)
--   - 10 RLS-Policies referenzieren 'leadbearbeiter'
--
-- Scope dieser Migration:
--   1. Spalten-Rename faelle.leadbearbeiter_id → dispatch_id
--   2. LB-only Policy auf faelle droppen (Dispatch hat bereits Full-Access)
--   3. 9 RLS-Policies neu definieren ohne 'leadbearbeiter' im Array
--
-- Nicht im Scope (bewusst):
--   - user_role-Enum-Wert 'leadbearbeiter' bleibt drin. PostgreSQL erlaubt
--     kein DROP VALUE auf ENUM. Separate Migration wenn Enum komplett
--     neu aufgesetzt werden soll. 0 Profile haben diesen Wert → kein
--     funktionales Risiko.

-- ─── 1. Column-Rename ──────────────────────────────────────────────────
ALTER TABLE public.faelle
  RENAME COLUMN leadbearbeiter_id TO dispatch_id;

-- Bestehende Indizes/FK folgen dem Spaltenumbenennen automatisch.
-- View v_faelle_mit_aktuellem_termin updated sich intern (PG hält
-- Referenzen per OID) — pg_get_viewdef zeigt nach Rename den neuen Namen.

-- ─── 2. Faelle-LB-Only-Policy droppen ──────────────────────────────────
-- "LB sieht eigene und unzugewiesene Faelle" war rolle='leadbearbeiter'-
-- gated. Dispatch hat bereits "Dispatch full access faelle" → deckt ab.
DROP POLICY IF EXISTS "LB sieht eigene und unzugewiesene Faelle" ON public.faelle;

-- ─── 3. RLS-Policies neu definieren (9 Policies) ───────────────────────

-- provisionen_maik
DROP POLICY IF EXISTS "Mitarbeiter provisionen_maik" ON public.provisionen_maik;
CREATE POLICY "Mitarbeiter provisionen_maik" ON public.provisionen_maik
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND rolle = ANY (ARRAY['admin'::user_role, 'kundenbetreuer'::user_role, 'dispatch'::user_role]))
  );

-- aircall_calls
DROP POLICY IF EXISTS "aircall_calls_staff" ON public.aircall_calls;
CREATE POLICY "aircall_calls_staff" ON public.aircall_calls
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND rolle = ANY (ARRAY['admin'::user_role, 'kundenbetreuer'::user_role, 'dispatch'::user_role]))
  );

-- fall_summaries
DROP POLICY IF EXISTS "fall_summaries_staff" ON public.fall_summaries;
CREATE POLICY "fall_summaries_staff" ON public.fall_summaries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND rolle = ANY (ARRAY['admin'::user_role, 'kundenbetreuer'::user_role, 'dispatch'::user_role]))
  );

-- dokument_upload_anfragen
DROP POLICY IF EXISTS "dua_staff_read" ON public.dokument_upload_anfragen;
CREATE POLICY "dua_staff_read" ON public.dokument_upload_anfragen
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role]))
  );

-- calls
DROP POLICY IF EXISTS "staff_fall_scoped" ON public.calls;
CREATE POLICY "staff_fall_scoped" ON public.calls
  FOR ALL USING (
    ((fall_id IS NOT NULL) AND can_access_fall(fall_id))
    OR ((fall_id IS NULL) AND EXISTS (SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role])))
  );

-- call_copilot_suggestions
DROP POLICY IF EXISTS "staff_fall_scoped" ON public.call_copilot_suggestions;
CREATE POLICY "staff_fall_scoped" ON public.call_copilot_suggestions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM calls c
      WHERE c.id = call_copilot_suggestions.call_id
        AND (((c.fall_id IS NOT NULL) AND can_access_fall(c.fall_id))
          OR ((c.fall_id IS NULL) AND EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role])))))
  );

-- call_transcription_utterances
DROP POLICY IF EXISTS "staff_fall_scoped" ON public.call_transcription_utterances;
CREATE POLICY "staff_fall_scoped" ON public.call_transcription_utterances
  FOR ALL USING (
    EXISTS (SELECT 1 FROM calls c
      WHERE c.id = call_transcription_utterances.call_id
        AND (((c.fall_id IS NOT NULL) AND can_access_fall(c.fall_id))
          OR ((c.fall_id IS NULL) AND EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role])))))
  );

-- tasks
DROP POLICY IF EXISTS "staff_fall_scoped" ON public.tasks;
CREATE POLICY "staff_fall_scoped" ON public.tasks
  FOR ALL USING (
    ((fall_id IS NOT NULL) AND can_access_fall(fall_id))
    OR ((fall_id IS NULL) AND (lead_id IS NOT NULL) AND EXISTS (SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role])))
    OR (zugewiesen_an = auth.uid())
    OR (empfaenger_user_id = auth.uid())
    OR ((fall_id IS NULL) AND (lead_id IS NULL) AND EXISTS (SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role])))
  );

-- leads
DROP POLICY IF EXISTS "staff_role_scoped" ON public.leads;
CREATE POLICY "staff_role_scoped" ON public.leads
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]))
    OR EXISTS (SELECT 1 FROM faelle f
      JOIN profiles p ON p.id = auth.uid()
      WHERE f.lead_id = leads.id
        AND p.rolle = 'kundenbetreuer'::user_role
        AND f.kundenbetreuer_id = auth.uid())
  );
