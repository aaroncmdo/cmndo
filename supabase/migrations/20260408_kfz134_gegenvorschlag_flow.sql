-- KFZ-134: Gegenvorschlag-Pingpong SV <-> Kunde
-- Neue Spalten fuer gutachter_termine + System-Messages in nachrichten

-- 1. gutachter_termine: Gegenvorschlag-Felder
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS vorgeschlagenes_datum TIMESTAMPTZ NULL;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS gegenvorschlag_grund TEXT NULL;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS gegenvorschlag_von TEXT NULL;

-- Constraint fuer gegenvorschlag_von
ALTER TABLE gutachter_termine DROP CONSTRAINT IF EXISTS gutachter_termine_gegenvorschlag_von_check;
ALTER TABLE gutachter_termine ADD CONSTRAINT gutachter_termine_gegenvorschlag_von_check
  CHECK (gegenvorschlag_von IN ('sv', 'kunde') OR gegenvorschlag_von IS NULL);

-- 2. nachrichten: System-Message Spalten
ALTER TABLE nachrichten ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE nachrichten ADD COLUMN IF NOT EXISTS system_event TEXT NULL;

-- Backfill: bestehende System-Nachrichten markieren
UPDATE nachrichten SET is_system = TRUE WHERE sender_rolle = 'system' AND is_system = FALSE;
