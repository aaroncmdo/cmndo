-- AAR-257: SV darf eigenen Eintrag updaten (für Spezifikationen-Toggle
-- und andere Self-Service-Felder im Profil)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='sv_update_own' AND tablename='sachverstaendige') THEN
    CREATE POLICY "sv_update_own"
    ON sachverstaendige FOR UPDATE TO authenticated
    USING (profile_id = auth.uid() OR user_id = auth.uid())
    WITH CHECK (profile_id = auth.uid() OR user_id = auth.uid());
  END IF;
END $$;;
