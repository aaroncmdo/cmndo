-- AAR-231: Kunden dürfen eigene Termine lesen (via Fall → kunde_id).
-- Policy wurde bereits live angewendet — IF NOT EXISTS als Safety-Net.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Kunde eigene Termine lesen'
    AND tablename = 'gutachter_termine'
  ) THEN
    CREATE POLICY "Kunde eigene Termine lesen"
    ON gutachter_termine FOR SELECT TO authenticated
    USING (fall_id IN (SELECT id FROM faelle WHERE kunde_id = auth.uid()));
  END IF;
END $$;
