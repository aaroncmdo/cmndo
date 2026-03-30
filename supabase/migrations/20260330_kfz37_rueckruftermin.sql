-- KFZ-37: Rueckruftermin bei Leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rueckruf_datum TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rueckruf_notiz TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rueckruf_erledigt BOOLEAN DEFAULT false;
