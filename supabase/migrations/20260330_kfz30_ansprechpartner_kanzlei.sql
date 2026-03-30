-- KFZ-30: Ansprechpartner im Kunden-Portal + Kanzlei-Kontakt
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS kanzlei_ansprechpartner_name TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS kanzlei_ansprechpartner_email TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS kanzlei_ansprechpartner_telefon TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS kanzlei_ansprechpartner_position TEXT;
