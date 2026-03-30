-- BUG-27: Dispatch-Board neue Arbeitsphasen
ALTER TABLE leads ADD COLUMN IF NOT EXISTS anruf_versuche INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS letzter_anruf_am TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS letzter_anruf_status TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS flow_link_geoeffnet BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS flow_link_abgeschlossen BOOLEAN DEFAULT false;

-- Erweiterte qualifizierungs_phase Werte
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_qualifizierungs_phase_check;
ALTER TABLE leads ADD CONSTRAINT leads_qualifizierungs_phase_check
  CHECK (qualifizierungs_phase IN (
    'neu', 'nicht-erreicht', 'rueckruf', 'in-qualifizierung',
    'flow-versendet', 'sa-ausstehend', 'konvertiert',
    'erstkontakt', 'schadentyp-erfasst', 'konstellation-erfasst',
    'gegner-daten', 'gutachtertermin', 'sa-unterschrieben',
    'flow-gesendet', 'abgeschlossen'
  ));
