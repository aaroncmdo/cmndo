-- AAR-265 W1: Gegner-Versicherung-FK (additiv, Freitext-Spalte bleibt als Fallback)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS gegner_versicherung_id UUID REFERENCES versicherungen(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_gegner_versicherung_id ON leads(gegner_versicherung_id) WHERE gegner_versicherung_id IS NOT NULL;

COMMENT ON COLUMN leads.gegner_versicherung_id IS 'AAR-265: FK auf versicherungen-Stammdaten. NULL = Freitext-Fallback in gegner_versicherung.';;
