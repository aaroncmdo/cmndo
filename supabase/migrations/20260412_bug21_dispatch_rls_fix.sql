-- BUG-21: dispatch-Rolle fehlte in RLS-Policies fuer leads, faelle, tasks
-- Dispatch-User sahen leere Seiten weil RLS sie blockierte

-- 1. leads
DROP POLICY IF EXISTS "Mitarbeiter leads" ON leads;
CREATE POLICY "Mitarbeiter leads" ON leads FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
  AND profiles.rolle IN ('kundenbetreuer','leadbearbeiter','admin','dispatch')
));

-- 2. faelle
DROP POLICY IF EXISTS "Kundenbetreuer faelle" ON faelle;
CREATE POLICY "Kundenbetreuer faelle" ON faelle FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
  AND profiles.rolle IN ('kundenbetreuer','leadbearbeiter','dispatch')
));

-- 3. tasks
DROP POLICY IF EXISTS "Mitarbeiter tasks" ON tasks;
CREATE POLICY "Mitarbeiter tasks" ON tasks FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
  AND profiles.rolle IN ('kundenbetreuer','leadbearbeiter','admin','dispatch')
));
