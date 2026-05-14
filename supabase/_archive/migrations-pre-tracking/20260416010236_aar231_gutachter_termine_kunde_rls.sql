
-- AAR-231: Kunden dürfen eigene Termine lesen (via Fall → kunde_id)
-- Ohne diese Policy zeigt das Onboarding "Wir suchen gerade..." obwohl Termin existiert
CREATE POLICY "Kunde eigene Termine lesen"
ON gutachter_termine
FOR SELECT
TO authenticated
USING (
  fall_id IN (
    SELECT id FROM faelle 
    WHERE kunde_id = auth.uid()
  )
);
;
