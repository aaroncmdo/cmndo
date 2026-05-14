-- AAR-418 (Whitelabeling V2): Verifiziert-Feld für SVs
-- 
-- Gate für das Kunden-Seite-Branding (Child 5, AAR-423).
-- Ein SV wird nur auf der Kunden-Token-Seite mit seiner Primary-Farbe
-- gebrandet wenn verifiziert = true. Default false = expliziter Aaron-Freigabe
-- nötig (Retention-Schutz).
--
-- Semantik unterscheidet sich bewusst von portal_zugang_freigeschaltet:
--   - portal_zugang_freigeschaltet: Darf sich der SV einloggen? (operativ)
--   - verifiziert: Ist der SV für Endkunden-Sichtbarkeit freigegeben? (trust)

ALTER TABLE sachverstaendige
  ADD COLUMN IF NOT EXISTS verifiziert boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verifiziert_am timestamptz,
  ADD COLUMN IF NOT EXISTS verifiziert_von uuid REFERENCES profiles(id);

COMMENT ON COLUMN sachverstaendige.verifiziert IS 
  'AAR-418: Gate für Custom-Branding auf der Kunden-Token-Seite. Muss manuell durch Admin gesetzt werden. Default false = Retention-Schutz (nur Claimondo-Branding bis explizit freigegeben).';

COMMENT ON COLUMN sachverstaendige.verifiziert_am IS 
  'AAR-418: Zeitpunkt der Verifizierung durch Admin.';

COMMENT ON COLUMN sachverstaendige.verifiziert_von IS 
  'AAR-418: Admin-User der die Verifizierung vorgenommen hat.';

CREATE INDEX IF NOT EXISTS idx_sachverstaendige_verifiziert 
  ON sachverstaendige(verifiziert) 
  WHERE verifiziert = true;;
