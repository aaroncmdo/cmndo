-- AAR-265 W1b: Gegner-Versicherung-FK in faelle für Lead → Fall-Weitergabe
ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS gegner_versicherung_id UUID REFERENCES versicherungen(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_faelle_gegner_versicherung_id ON faelle(gegner_versicherung_id) WHERE gegner_versicherung_id IS NOT NULL;

COMMENT ON COLUMN faelle.gegner_versicherung_id IS 'AAR-265: FK auf versicherungen-Stammdaten. NULL = Freitext-Fallback in gegner_versicherung.';;
