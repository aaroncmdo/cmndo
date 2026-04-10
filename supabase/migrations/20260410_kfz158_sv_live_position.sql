-- KFZ-158 Phase 2: GPS Live-Tracking fuer Sachverstaendige.
-- sv_live_position speichert die letzte bekannte Position pro SV.
-- Wird alle 30s vom Frontend via Server Action geschrieben.

ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS live_tracking_enabled BOOLEAN DEFAULT true;

CREATE TABLE IF NOT EXISTS sv_live_position (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gutachter_id UUID NOT NULL REFERENCES sachverstaendige(id) ON DELETE CASCADE,
  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  accuracy_m NUMERIC(8,2),
  heading NUMERIC(5,2),
  speed_kmh NUMERIC(5,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sv_live_position_gutachter ON sv_live_position(gutachter_id, updated_at DESC);

ALTER TABLE sv_live_position ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sv_can_insert_own_position" ON sv_live_position
  FOR INSERT WITH CHECK (
    gutachter_id IN (SELECT id FROM sachverstaendige WHERE profile_id = auth.uid())
  );
CREATE POLICY "admin_can_read_all_positions" ON sv_live_position
  FOR SELECT USING (
    (SELECT rolle FROM profiles WHERE id = auth.uid()) = 'admin'
  );
CREATE POLICY "sv_can_read_own_position" ON sv_live_position
  FOR SELECT USING (
    gutachter_id IN (SELECT id FROM sachverstaendige WHERE profile_id = auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE sv_live_position;
