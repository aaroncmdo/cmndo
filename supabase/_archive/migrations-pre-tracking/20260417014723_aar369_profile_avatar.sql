-- AAR-369: Profilbilder + Anzeige-Infos für alle Mitarbeiter-Rollen
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS anzeigename TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profilbeschreibung TEXT;

COMMENT ON COLUMN public.profiles.avatar_url IS
  'AAR-369: Public URL des Profilbilds aus dem avatare-Bucket. NULL = Initialen-Fallback.';
COMMENT ON COLUMN public.profiles.anzeigename IS
  'AAR-369: Optionaler Anzeigename für Kunden-UI (z. B. "Max M."). Fallback: vorname + nachname.';
COMMENT ON COLUMN public.profiles.profilbeschreibung IS
  'AAR-369: Kurzer Profiltext (z. B. "Ihr persönlicher Kundenbetreuer"), sichtbar in Kunden-Karten.';

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatare', 'avatare', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatare_owner_insert') THEN
    CREATE POLICY "avatare_owner_insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'avatare' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatare_owner_update') THEN
    CREATE POLICY "avatare_owner_update" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'avatare' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatare_owner_delete') THEN
    CREATE POLICY "avatare_owner_delete" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'avatare' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatare_public_read') THEN
    CREATE POLICY "avatare_public_read" ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'avatare');
  END IF;
END$$;;
