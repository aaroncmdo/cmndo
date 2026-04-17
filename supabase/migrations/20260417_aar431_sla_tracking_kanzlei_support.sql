-- AAR-431: Kanzlei-SLA-Support auf sla_tracking
-- Erweitert bestehende Tabelle um target_rolle (wer sollte liefern),
-- blocker_rolle/blocker_grund (wer blockt beim Breach), phase (Phasen-Label),
-- n_mahnungen/letzte_mahnung_am (Mahnungs-Stufen-Tracking).

ALTER TABLE sla_tracking ADD COLUMN IF NOT EXISTS target_rolle TEXT DEFAULT 'sv';
ALTER TABLE sla_tracking ADD COLUMN IF NOT EXISTS blocker_rolle TEXT;
ALTER TABLE sla_tracking ADD COLUMN IF NOT EXISTS blocker_grund TEXT;
ALTER TABLE sla_tracking ADD COLUMN IF NOT EXISTS phase TEXT;
ALTER TABLE sla_tracking ADD COLUMN IF NOT EXISTS n_mahnungen INTEGER DEFAULT 0;
ALTER TABLE sla_tracking ADD COLUMN IF NOT EXISTS letzte_mahnung_am TIMESTAMPTZ;

COMMENT ON COLUMN sla_tracking.target_rolle IS 'AAR-431: Wer sollte liefern — sv | kanzlei | kunde';
COMMENT ON COLUMN sla_tracking.blocker_rolle IS 'AAR-431: Wer blockt aktuell (bei breach gesetzt)';
COMMENT ON COLUMN sla_tracking.blocker_grund IS 'AAR-431: Menschlich lesbarer Grund';

CREATE INDEX IF NOT EXISTS idx_sla_tracking_target_rolle ON sla_tracking(target_rolle) WHERE status IN ('pending','breached');
