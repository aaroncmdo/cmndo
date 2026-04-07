-- KFZ-129: Gruppen-Chat pro Fall
-- Neue Tabellen: chat_gruppen + chat_teilnehmer
-- nachrichten: gruppe_id Spalte + kanal 'gruppe' erlauben

-- 1. Chat-Gruppen
CREATE TABLE IF NOT EXISTS chat_gruppen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id UUID NOT NULL REFERENCES faelle(id) ON DELETE CASCADE,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(fall_id)
);

-- 2. Chat-Teilnehmer
CREATE TABLE IF NOT EXISTS chat_teilnehmer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gruppe_id UUID NOT NULL REFERENCES chat_gruppen(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rolle TEXT NOT NULL CHECK (rolle IN ('kunde', 'kundenbetreuer', 'gutachter', 'admin')),
  hinzugefuegt_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  entfernt_am TIMESTAMPTZ,
  UNIQUE(gruppe_id, user_id)
);

-- 3. nachrichten: gruppe_id Spalte
ALTER TABLE nachrichten ADD COLUMN IF NOT EXISTS gruppe_id UUID REFERENCES chat_gruppen(id);

-- 4. kanal CHECK Constraint erweitern (alte droppen, neue setzen)
ALTER TABLE nachrichten DROP CONSTRAINT IF EXISTS nachrichten_kanal_check;
ALTER TABLE nachrichten ADD CONSTRAINT nachrichten_kanal_check
  CHECK (kanal IN ('whatsapp', 'portal-kunde-claimondo', 'portal-kunde-gutachter', 'gruppe'));

-- 5. Index fuer schnelle Gruppen-Abfragen
CREATE INDEX IF NOT EXISTS idx_chat_gruppen_fall_id ON chat_gruppen(fall_id);
CREATE INDEX IF NOT EXISTS idx_chat_teilnehmer_gruppe_id ON chat_teilnehmer(gruppe_id);
CREATE INDEX IF NOT EXISTS idx_chat_teilnehmer_user_id ON chat_teilnehmer(user_id);
CREATE INDEX IF NOT EXISTS idx_nachrichten_gruppe_id ON nachrichten(gruppe_id);

-- 6. Backfill: Gruppen fuer bestehende Faelle mit Nachrichten erstellen
INSERT INTO chat_gruppen (fall_id)
  SELECT DISTINCT fall_id FROM nachrichten WHERE fall_id IS NOT NULL
  ON CONFLICT (fall_id) DO NOTHING;

-- 7. Bestehende Nachrichten der Gruppe zuordnen
UPDATE nachrichten n
  SET gruppe_id = cg.id
  FROM chat_gruppen cg
  WHERE cg.fall_id = n.fall_id AND n.gruppe_id IS NULL;

-- 8. Bestehende Teilnehmer backfillen (Kunden, KBs, SVs)
-- Kunden als Teilnehmer
INSERT INTO chat_teilnehmer (gruppe_id, user_id, rolle)
  SELECT cg.id, f.kunde_id, 'kunde'
  FROM chat_gruppen cg
  JOIN faelle f ON f.id = cg.fall_id
  WHERE f.kunde_id IS NOT NULL
  ON CONFLICT (gruppe_id, user_id) DO NOTHING;

-- Kundenbetreuer als Teilnehmer
INSERT INTO chat_teilnehmer (gruppe_id, user_id, rolle)
  SELECT cg.id, f.kundenbetreuer_id, 'kundenbetreuer'
  FROM chat_gruppen cg
  JOIN faelle f ON f.id = cg.fall_id
  WHERE f.kundenbetreuer_id IS NOT NULL
  ON CONFLICT (gruppe_id, user_id) DO NOTHING;

-- Gutachter als Teilnehmer (via sachverstaendige.profile_id)
INSERT INTO chat_teilnehmer (gruppe_id, user_id, rolle)
  SELECT cg.id, sv.profile_id, 'gutachter'
  FROM chat_gruppen cg
  JOIN faelle f ON f.id = cg.fall_id
  JOIN sachverstaendige sv ON sv.id = f.sv_id
  WHERE f.sv_id IS NOT NULL AND sv.profile_id IS NOT NULL
  ON CONFLICT (gruppe_id, user_id) DO NOTHING;

-- 9. RLS fuer neue Tabellen
ALTER TABLE chat_gruppen ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_teilnehmer ENABLE ROW LEVEL SECURITY;

-- Admins/KB sehen alles
CREATE POLICY "admin_full_access_chat_gruppen" ON chat_gruppen
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin', 'kundenbetreuer')));

CREATE POLICY "admin_full_access_chat_teilnehmer" ON chat_teilnehmer
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin', 'kundenbetreuer')));

-- Kunde sieht eigene Gruppen
CREATE POLICY "kunde_select_chat_gruppen" ON chat_gruppen
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_teilnehmer ct WHERE ct.gruppe_id = id AND ct.user_id = auth.uid() AND ct.entfernt_am IS NULL));

CREATE POLICY "kunde_select_chat_teilnehmer" ON chat_teilnehmer
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_teilnehmer ct2 WHERE ct2.gruppe_id = gruppe_id AND ct2.user_id = auth.uid() AND ct2.entfernt_am IS NULL));

-- Gutachter sieht eigene Gruppen
CREATE POLICY "gutachter_select_chat_gruppen" ON chat_gruppen
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_teilnehmer ct
    JOIN profiles p ON p.id = ct.user_id
    WHERE ct.gruppe_id = id AND ct.user_id = auth.uid() AND ct.entfernt_am IS NULL
    AND p.rolle IN ('gutachter', 'sachverstaendiger')
  ));

-- 10. Realtime fuer neue Tabellen
ALTER PUBLICATION supabase_realtime ADD TABLE chat_gruppen;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_teilnehmer;
