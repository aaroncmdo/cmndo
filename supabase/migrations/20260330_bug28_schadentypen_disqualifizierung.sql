-- BUG-28: Disqualifizierungs-Felder
ALTER TABLE leads ADD COLUMN IF NOT EXISTS disqualifiziert BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS disqualifiziert_grund TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS disqualifiziert_notiz TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS disqualifiziert_am TIMESTAMPTZ;

-- Erweitere qualifizierungs_phase um 'disqualifiziert'
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_qualifizierungs_phase_check;
ALTER TABLE leads ADD CONSTRAINT leads_qualifizierungs_phase_check
  CHECK (qualifizierungs_phase IN (
    'neu', 'nicht-erreicht', 'rueckruf', 'in-qualifizierung',
    'flow-versendet', 'sa-ausstehend', 'konvertiert', 'disqualifiziert',
    'erstkontakt', 'schadentyp-erfasst', 'konstellation-erfasst',
    'gegner-daten', 'gutachtertermin', 'sa-unterschrieben',
    'flow-gesendet', 'abgeschlossen'
  ));
