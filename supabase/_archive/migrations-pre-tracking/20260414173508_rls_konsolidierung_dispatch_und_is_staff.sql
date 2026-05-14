-- ============================================================================
-- RLS-Konsolidierung: is_staff() um dispatch erweitern + alle Policies konsolidieren
-- Datum: 14.04.2026
-- Zweck: Test-Killer beheben — Dispatch-Rolle konnte viele Tabellen nicht lesen/schreiben
-- ============================================================================

-- ─── 1. is_staff() erweitern um dispatch ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND rolle IN ('admin', 'kundenbetreuer', 'leadbearbeiter', 'dispatch')
  );
$function$;

COMMENT ON FUNCTION public.is_staff() IS 'Returns true if current user has any internal staff role (admin, kundenbetreuer, leadbearbeiter, dispatch). Erweitert 14.04.2026 um dispatch.';

-- ─── 2. gutachter_termine: Mitarbeiter-Policy hinzufuegen ────────────────
DROP POLICY IF EXISTS "Mitarbeiter gutachter_termine" ON gutachter_termine;
CREATE POLICY "Mitarbeiter gutachter_termine" ON gutachter_termine
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());

-- ─── 3. pflichtdokumente: alte Mitarbeiter-Policy ersetzen ───────────────
DROP POLICY IF EXISTS "Mitarbeiter pflichtdokumente" ON pflichtdokumente;
CREATE POLICY "Mitarbeiter pflichtdokumente" ON pflichtdokumente
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());

-- ─── 4. sachverstaendige: alte Mitarbeiter-Policy ersetzen ──────────────
DROP POLICY IF EXISTS "Mitarbeiter sachverstaendige" ON sachverstaendige;
CREATE POLICY "Mitarbeiter sachverstaendige" ON sachverstaendige
  FOR SELECT
  USING (is_staff());

-- ─── 5. timeline: alte Mitarbeiter-Policy ersetzen ──────────────────────
DROP POLICY IF EXISTS "Mitarbeiter timeline" ON timeline;
CREATE POLICY "Mitarbeiter timeline" ON timeline
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());

-- ─── 6. nachrichten: Duplikate aufraeumen + Mitarbeiter konsolidieren ────
DROP POLICY IF EXISTS "admin_nachrichten_all" ON nachrichten;
DROP POLICY IF EXISTS "kundenbetreuer_nachrichten" ON nachrichten;
DROP POLICY IF EXISTS "Mitarbeiter nachrichten" ON nachrichten;
CREATE POLICY "Mitarbeiter nachrichten" ON nachrichten
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());

-- ─── 7. reklamationen: Mitarbeiter ALL hinzufuegen ──────────────────────
DROP POLICY IF EXISTS "Mitarbeiter reklamationen" ON reklamationen;
CREATE POLICY "Mitarbeiter reklamationen" ON reklamationen
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());

-- ─── 8. fall_dokumente: Mitarbeiter konsolidieren ───────────────────────
DROP POLICY IF EXISTS "Admin full access fall_dokumente" ON fall_dokumente;
DROP POLICY IF EXISTS "Mitarbeiter fall_dokumente" ON fall_dokumente;
CREATE POLICY "Mitarbeiter fall_dokumente" ON fall_dokumente
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());

-- ─── 9. faelle: Duplikat entfernen + Mitarbeiter konsolidieren ──────────
DROP POLICY IF EXISTS "kunde_select_own_fall" ON faelle;
DROP POLICY IF EXISTS "Kundenbetreuer faelle" ON faelle;
DROP POLICY IF EXISTS "Mitarbeiter faelle" ON faelle;
CREATE POLICY "Mitarbeiter faelle" ON faelle
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());

-- ─── 10. leads: Mitarbeiter konsolidieren ────────────────────────────────
DROP POLICY IF EXISTS "Mitarbeiter leads" ON leads;
CREATE POLICY "Mitarbeiter leads" ON leads
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());

-- ─── 11. tasks: Mitarbeiter konsolidieren ────────────────────────────────
DROP POLICY IF EXISTS "Mitarbeiter tasks" ON tasks;
CREATE POLICY "Mitarbeiter tasks" ON tasks
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());;
