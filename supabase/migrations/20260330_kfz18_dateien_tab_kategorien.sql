-- KFZ-18: Dateien-Tab sortiert + Sichtbarkeit
-- Spalten kategorie, hochgeladen_von_rolle, quelle, sichtbar_fuer existieren bereits.
-- Hier nur CHECK constraints und Defaults nachrüsten.

-- CHECK constraint für kategorie
DO $$ BEGIN
  ALTER TABLE dokumente ADD CONSTRAINT chk_dokumente_kategorie
    CHECK (kategorie IN ('kundendokument','schadensfoto','gutachten','kanzlei','unterschrift','sonstiges','whatsapp-foto','gutachter-foto'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CHECK constraint für quelle
DO $$ BEGIN
  ALTER TABLE dokumente ADD CONSTRAINT chk_dokumente_quelle
    CHECK (quelle IN ('flowlink','portal','whatsapp','gutachter','admin','kanzlei'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Default für sichtbar_fuer falls nicht gesetzt
ALTER TABLE dokumente ALTER COLUMN sichtbar_fuer SET DEFAULT ARRAY['admin']::text[];
