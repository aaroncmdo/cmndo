-- KFZ-190 / BUG-106: Globaler RLS-Sweep
-- Applied via Supabase MCP on 2026-04-10
-- 21 Tabellen ohne RLS -> alle geschuetzt
-- 4 Helper Functions + 30+ Policies

-- Helper Functions (SECURITY DEFINER = bypass RLS)
CREATE OR REPLACE FUNCTION is_staff() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin', 'kundenbetreuer', 'leadbearbeiter'));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_rolle() RETURNS TEXT AS $$
  SELECT rolle::text FROM profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_sv() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle = 'sachverstaendiger');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_sv_id() RETURNS UUID AS $$
  SELECT id FROM sachverstaendige WHERE profile_id = auth.uid() OR user_id = auth.uid() ORDER BY ist_parent_account ASC NULLS LAST LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- System-Tabellen (Admin-only)
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_only" ON email_log FOR ALL TO authenticated USING (is_admin());
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_only" ON stripe_events FOR ALL TO authenticated USING (is_admin());
ALTER TABLE sv_payment_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_only" ON sv_payment_reminders FOR ALL TO authenticated USING (is_admin());
ALTER TABLE abrechnung_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_only" ON abrechnung_reminders FOR ALL TO authenticated USING (is_admin());
ALTER TABLE admin_termine ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_access" ON admin_termine FOR ALL TO authenticated USING (is_staff());
ALTER TABLE aircall_relay_seats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_access" ON aircall_relay_seats FOR ALL TO authenticated USING (is_staff());

-- Call-Tabellen (Staff-only)
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_access" ON calls FOR ALL TO authenticated USING (is_staff());
ALTER TABLE call_copilot_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_access" ON call_copilot_suggestions FOR ALL TO authenticated USING (is_staff());
ALTER TABLE call_transcription_utterances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_access" ON call_transcription_utterances FOR ALL TO authenticated USING (is_staff());

-- Gutachter-Tabellen (SV eigene + Admin alle)
ALTER TABLE gutschriften ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sv_own" ON gutschriften FOR SELECT TO authenticated USING (gutachter_id = get_sv_id() OR is_admin());
CREATE POLICY "admin_write" ON gutschriften FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
ALTER TABLE individuelle_anfragen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sv_own" ON individuelle_anfragen FOR SELECT TO authenticated USING (sv_id = get_sv_id() OR is_admin());
CREATE POLICY "sv_insert" ON individuelle_anfragen FOR INSERT TO authenticated WITH CHECK (sv_id = get_sv_id() OR is_admin());
CREATE POLICY "admin_write" ON individuelle_anfragen FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
ALTER TABLE vertraege_unterzeichnet ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sv_own_read" ON vertraege_unterzeichnet FOR SELECT TO authenticated USING (gutachter_id = get_sv_id() OR is_staff());
CREATE POLICY "admin_write" ON vertraege_unterzeichnet FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
ALTER TABLE reklamationen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sv_own_read" ON reklamationen FOR SELECT TO authenticated USING (gutachter_id = get_sv_id() OR is_staff());
CREATE POLICY "sv_insert" ON reklamationen FOR INSERT TO authenticated WITH CHECK (gutachter_id = get_sv_id() OR is_admin());
CREATE POLICY "admin_manage" ON reklamationen FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Abrechnung-Tabellen
ALTER TABLE abrechnung_positionen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_access" ON abrechnung_positionen FOR ALL TO authenticated USING (is_staff());

-- Kanzlei-Tabellen
ALTER TABLE kanzleien ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_read" ON kanzleien FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY "admin_write" ON kanzleien FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
ALTER TABLE kanzlei_abrechnungen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_read" ON kanzlei_abrechnungen FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY "admin_write" ON kanzlei_abrechnungen FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
ALTER TABLE kanzlei_abrechnung_positionen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_read" ON kanzlei_abrechnung_positionen FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY "admin_write" ON kanzlei_abrechnung_positionen FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
ALTER TABLE kanzlei_abrechnung_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_only" ON kanzlei_abrechnung_reminders FOR ALL TO authenticated USING (is_admin());

-- Lookup-Tabellen (Authenticated read, Admin write)
ALTER TABLE leadpreise_tabelle ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON leadpreise_tabelle FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_write" ON leadpreise_tabelle FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
ALTER TABLE vertragsvorlagen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON vertragsvorlagen FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_write" ON vertragsvorlagen FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Profiles Fix: Drop USING(true), Enable RLS, restriktive Policies
DROP POLICY IF EXISTS "Mitarbeiter profiles" ON profiles;
DROP POLICY IF EXISTS "Admins full profiles" ON profiles;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_read_all" ON profiles FOR SELECT TO authenticated USING (id = auth.uid() OR is_staff());
CREATE POLICY "admin_full" ON profiles FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
