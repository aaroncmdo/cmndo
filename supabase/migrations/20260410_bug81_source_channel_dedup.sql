-- BUG-81: lead_source_channel Duplikat auf faelle entfernen.
-- Kanonisch: source_channel. lead_source_channel hatte 0 Daten.
UPDATE faelle SET source_channel = COALESCE(source_channel, lead_source_channel)
WHERE source_channel IS NULL AND lead_source_channel IS NOT NULL;
ALTER TABLE faelle DROP COLUMN IF EXISTS lead_source_channel;
