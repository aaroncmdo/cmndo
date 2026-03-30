-- KFZ-17: Chat-System pro Akte
-- Nachrichten-Tabelle mit Kanälen für WhatsApp, Kunde-Claimondo, Kunde-Gutachter

CREATE TABLE IF NOT EXISTS nachrichten (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id UUID REFERENCES faelle(id) ON DELETE CASCADE,
  kanal TEXT NOT NULL CHECK (kanal IN ('whatsapp', 'portal-kunde-claimondo', 'portal-kunde-gutachter')),
  sender_id UUID REFERENCES profiles(id),
  sender_rolle TEXT,
  nachricht TEXT NOT NULL,
  hat_anhang BOOLEAN DEFAULT false,
  anhang_url TEXT,
  anhang_typ TEXT,
  gelesen BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE nachrichten ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "admin_nachrichten_all" ON nachrichten
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle = 'admin')
  );

-- Kundenbetreuer full access on their cases
CREATE POLICY "kundenbetreuer_nachrichten" ON nachrichten
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN faelle f ON f.kundenbetreuer_id = p.id
      WHERE p.id = auth.uid()
        AND p.rolle = 'kundenbetreuer'
        AND f.id = nachrichten.fall_id
    )
  );

-- Kunde: only portal-kunde-claimondo and portal-kunde-gutachter on own cases
CREATE POLICY "kunde_nachrichten_read" ON nachrichten
  FOR SELECT USING (
    kanal IN ('portal-kunde-claimondo', 'portal-kunde-gutachter')
    AND EXISTS (
      SELECT 1 FROM faelle WHERE id = nachrichten.fall_id AND kunde_id = auth.uid()
    )
  );

CREATE POLICY "kunde_nachrichten_insert" ON nachrichten
  FOR INSERT WITH CHECK (
    kanal IN ('portal-kunde-claimondo', 'portal-kunde-gutachter')
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM faelle WHERE id = nachrichten.fall_id AND kunde_id = auth.uid()
    )
  );

-- Gutachter: only portal-kunde-gutachter on their cases
CREATE POLICY "gutachter_nachrichten_read" ON nachrichten
  FOR SELECT USING (
    kanal = 'portal-kunde-gutachter'
    AND EXISTS (
      SELECT 1 FROM faelle f
      JOIN sachverstaendige s ON s.id = f.sv_id
      WHERE f.id = nachrichten.fall_id AND s.profile_id = auth.uid()
    )
  );

CREATE POLICY "gutachter_nachrichten_insert" ON nachrichten
  FOR INSERT WITH CHECK (
    kanal = 'portal-kunde-gutachter'
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM faelle f
      JOIN sachverstaendige s ON s.id = f.sv_id
      WHERE f.id = nachrichten.fall_id AND s.profile_id = auth.uid()
    )
  );

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_nachrichten_fall_id ON nachrichten(fall_id);
CREATE INDEX IF NOT EXISTS idx_nachrichten_kanal ON nachrichten(fall_id, kanal);
