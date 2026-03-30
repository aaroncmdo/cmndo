-- KFZ-19: KI-Schadenkalkulation Felder
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS ki_kalkulation JSONB;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS ki_kalkulation_am TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS ki_geschaetzte_kosten_min DECIMAL(10,2);
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS ki_geschaetzte_kosten_max DECIMAL(10,2);
