-- AAR-257: Gutachter dürfen eigenen sachverstaendige-Eintrag updaten.
-- Vorher existierten nur SELECT-Policies (plus Admin-ALL) — Spezifikationen-
-- Toggle + Profil-Save liefen als client-side Update in eine RLS-stille
-- Ablehnung (Supabase gab "success" ohne Rows zu updaten).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='sv_update_own' AND tablename='sachverstaendige') THEN
    CREATE POLICY "sv_update_own"
    ON sachverstaendige FOR UPDATE TO authenticated
    USING (profile_id = auth.uid() OR user_id = auth.uid())
    WITH CHECK (profile_id = auth.uid() OR user_id = auth.uid());
  END IF;
END $$;
