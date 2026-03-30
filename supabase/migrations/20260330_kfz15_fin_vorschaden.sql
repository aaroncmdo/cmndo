-- KFZ-15: FIN-Auslesung + CarDentity Vorschaden-Prüfung

ALTER TABLE faelle ADD COLUMN IF NOT EXISTS fin_vin TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS fin_quelle TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS fin_extrahiert_am TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vorschaden_geprueft BOOLEAN DEFAULT false;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vorschaden_vorhanden BOOLEAN;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vorschaden_anzahl INTEGER;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vorschaden_letzter_datum DATE;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vorschaden_typ_a_ergebnis JSONB;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vorschaden_typ_b_bericht JSONB;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vorschaden_typ_b_pdf_url TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS cardentity_abfrage_am TIMESTAMPTZ;
