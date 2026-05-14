
-- Salesforce-Webhook-Felder für AS-Details (wird später automatisch befüllt)
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS as_geforderte_summe numeric;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS as_frist date;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS as_vs_reaktion_text text;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS as_salesforce_id text;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS as_zuletzt_synced_am timestamptz;

-- LexDrive-spezifische Verknüpfung
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS lexdrive_case_id text;

-- Eskalations-Stufen 14/21/28 (zusätzlich zum existierenden vs_eskalation_am)
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS eskalation_tag_14_am timestamptz;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS eskalation_tag_21_am timestamptz;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS eskalation_tag_28_am timestamptz;

-- Kommentare für spätere Salesforce-Sync-Dokumentation
COMMENT ON COLUMN faelle.as_salesforce_id IS 'Wird via Salesforce-Webhook befüllt. Wenn NULL = manuell eingegeben.';
COMMENT ON COLUMN faelle.as_zuletzt_synced_am IS 'Letzter Sync mit Salesforce. NULL = nie synchronisiert.';
;
