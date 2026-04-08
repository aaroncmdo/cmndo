-- KFZ-140: Fallakte Komplett-Audit — fehlende Spalten fuer Versicherung, Marketing, Gutachten-Details

-- Versicherungs-Korrespondenz
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vs_anschreiben_datum TIMESTAMPTZ NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vs_antwort_datum TIMESTAMPTZ NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vs_timer_stufe TEXT NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vs_eskalation_am TIMESTAMPTZ NULL;

-- Marketing-Provision
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS marketing_quelle TEXT NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS marketing_provision DECIMAL(10,2) NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS marketing_provision_status TEXT NULL CHECK (marketing_provision_status IN ('offen','ausgezahlt') OR marketing_provision_status IS NULL);

-- Gutachten-Detail-Felder (ergaenzen was fehlt)
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS gutachten_stundensatz DECIMAL(10,2) NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS schadenhoehe_netto DECIMAL(10,2) NULL;

-- Kanzlei-Detail
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS kanzlei_id UUID NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS kanzlei_honorar DECIMAL(10,2) NULL;

-- Cash-Flow
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS zahlung_erwartet_am DATE NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS zahlung_eingegangen_am TIMESTAMPTZ NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS zahlung_betrag DECIMAL(10,2) NULL;
