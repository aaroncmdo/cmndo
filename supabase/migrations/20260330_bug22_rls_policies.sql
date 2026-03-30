-- BUG-22: RLS Policies fuer alle Rollen
-- Admin: sieht alles (bereits vorhanden)
-- Kundenbetreuer + Leadbearbeiter: alle Faelle, Leads, Tasks, Timeline, Dokumente
-- Gutachter: nur zugewiesene Faelle + Termine
-- Kunde: nur eigener Fall
-- Kanzlei: nur uebergebene Faelle

-- Kundenbetreuer + Leadbearbeiter Policies
CREATE POLICY "Kundenbetreuer faelle" ON faelle FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('kundenbetreuer', 'leadbearbeiter')));

CREATE POLICY "Mitarbeiter leads" ON leads FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('kundenbetreuer', 'leadbearbeiter', 'admin')));

CREATE POLICY "Mitarbeiter tasks" ON tasks FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('kundenbetreuer', 'leadbearbeiter', 'admin')));

CREATE POLICY "Mitarbeiter timeline" ON timeline FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('kundenbetreuer', 'leadbearbeiter', 'admin')));

CREATE POLICY "Mitarbeiter dokumente" ON dokumente FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('kundenbetreuer', 'leadbearbeiter', 'admin')));

CREATE POLICY "Mitarbeiter sachverstaendige" ON sachverstaendige FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('kundenbetreuer', 'leadbearbeiter', 'admin')));

CREATE POLICY "Mitarbeiter parteien" ON parteien FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('kundenbetreuer', 'leadbearbeiter', 'admin')));

CREATE POLICY "Mitarbeiter pflichtdokumente" ON pflichtdokumente FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('kundenbetreuer', 'leadbearbeiter', 'admin')));

CREATE POLICY "Mitarbeiter schadenspositionen" ON schadenspositionen FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('kundenbetreuer', 'leadbearbeiter', 'admin')));

-- Gutachter Policies
CREATE POLICY "Gutachter tasks" ON tasks FOR SELECT TO authenticated
USING (zugewiesen_an = auth.uid());

CREATE POLICY "Gutachter dokumente" ON dokumente FOR SELECT TO authenticated
USING (fall_id IN (SELECT f.id FROM faelle f JOIN sachverstaendige s ON s.id = f.sv_id WHERE s.profile_id = auth.uid()));

CREATE POLICY "Gutachter timeline" ON timeline FOR SELECT TO authenticated
USING (fall_id IN (SELECT f.id FROM faelle f JOIN sachverstaendige s ON s.id = f.sv_id WHERE s.profile_id = auth.uid()));

-- Kunde Policies
CREATE POLICY "Kunde dokumente" ON dokumente FOR SELECT TO authenticated
USING (fall_id IN (SELECT id FROM faelle WHERE kunde_id = auth.uid()));

CREATE POLICY "Kunde timeline" ON timeline FOR SELECT TO authenticated
USING (fall_id IN (SELECT id FROM faelle WHERE kunde_id = auth.uid()));

CREATE POLICY "Kunde tasks" ON tasks FOR SELECT TO authenticated
USING (fall_id IN (SELECT id FROM faelle WHERE kunde_id = auth.uid()));

-- Kanzlei
CREATE POLICY "Kanzlei faelle" ON faelle FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle = 'kanzlei') AND status IN ('kanzlei-uebergeben', 'anschlussschreiben', 'regulierung', 'abgeschlossen'));

-- Profile Lookup fuer alle Auth-User
CREATE POLICY "Mitarbeiter profiles" ON profiles FOR SELECT TO authenticated USING (true);
