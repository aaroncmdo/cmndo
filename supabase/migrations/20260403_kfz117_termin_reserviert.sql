-- KFZ-117: Termin-Status-Logik — reserviert (vor SA) vs bestätigt (nach SA)
-- Neue Spalte lead_id auf gutachter_termine, damit wir nach SA den Termin finden können
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id);

-- Index für schnelle Suche
CREATE INDEX IF NOT EXISTS idx_gutachter_termine_lead_id ON gutachter_termine(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gutachter_termine_status ON gutachter_termine(status);
