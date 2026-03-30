-- KFZ-20: Neue Spalten fuer WhatsApp-Statusnachrichten
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS regulierung_angekuendigt_am TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS zahlung_eingegangen_am TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS abgeschlossen_am TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS google_review_gesendet BOOLEAN DEFAULT false;
