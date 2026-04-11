-- KFZ-202b: Fehlende Spalten aus Task 01 (Totalschaden, Zahlungsweg, Vorschaeden,
-- Technische Stellungnahme, Nachbesichtigung, Termine Verschiebung)

-- Totalschaden + Zahlungsweg
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS ist_totalschaden BOOLEAN DEFAULT false;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS zahlungsweg TEXT
  CHECK (zahlungsweg IN ('kundenkonto', 'werkstatt_direkt'));

-- Vorschaeden (referenziert in Task 01 + Task 08)
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS hat_vorschaeden BOOLEAN DEFAULT false;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vorschaeden_beschreibung TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS hat_vorschaeden BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vorschaeden_beschreibung TEXT;

-- Technische Stellungnahme (Ruege-SubFlow)
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS technische_stellungnahme_status TEXT
  DEFAULT 'nicht_benoetigt'
  CHECK (technische_stellungnahme_status IN (
    'nicht_benoetigt', 'beauftragt', 'hochgeladen', 'freigegeben', 'abgelehnt'
  ));
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS technische_stellungnahme_beauftragt_am TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS technische_stellungnahme_hochgeladen_am TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS technische_stellungnahme_freigabe_am TIMESTAMPTZ;

-- Nachbesichtigung
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS nachbesichtigung_status TEXT
  DEFAULT 'nicht_angefordert'
  CHECK (nachbesichtigung_status IN (
    'nicht_angefordert', 'angefordert', 'termin_gewaehlt', 'abgeschlossen'
  ));
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS nachbesichtigung_angefordert_am TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS nachbesichtigung_termin_datum TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS nachbesichtigung_konfrontation BOOLEAN DEFAULT false;

-- Termine: Verschiebungsgrund
ALTER TABLE termine ADD COLUMN IF NOT EXISTS verschiebung_grund TEXT;
