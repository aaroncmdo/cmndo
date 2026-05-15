-- AAR-218: RLS-Policies fuer gutachter-logos Bucket. Die bisherigen
-- auth.role()-basierten Policies haben Upload zuverlaessig geblockt
-- (Logo-Upload Willkommen Step 4 → 400). Ersetzen durch saubere, auf
-- SV-Ordner (sv_id) bzw. Organisations-Ordner (org/<organisation_id>)
-- gescopte Policies. Public SELECT bleibt — Bucket ist public.

DROP POLICY IF EXISTS gutachter_logos_insert ON storage.objects;
DROP POLICY IF EXISTS gutachter_logos_select ON storage.objects;
DROP POLICY IF EXISTS gutachter_logos_update ON storage.objects;
DROP POLICY IF EXISTS gutachter_logos_delete ON storage.objects;

CREATE POLICY gutachter_logos_select ON storage.objects
  FOR SELECT
  USING (bucket_id = 'gutachter-logos');

CREATE POLICY gutachter_logos_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'gutachter-logos'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.sachverstaendige WHERE user_id = auth.uid()
      )
      OR (
        (storage.foldername(name))[1] = 'org'
        AND (storage.foldername(name))[2] IN (
          SELECT id::text FROM public.organisationen WHERE hauptansprechpartner_user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY gutachter_logos_update ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'gutachter-logos'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.sachverstaendige WHERE user_id = auth.uid()
      )
      OR (
        (storage.foldername(name))[1] = 'org'
        AND (storage.foldername(name))[2] IN (
          SELECT id::text FROM public.organisationen WHERE hauptansprechpartner_user_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'gutachter-logos'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.sachverstaendige WHERE user_id = auth.uid()
      )
      OR (
        (storage.foldername(name))[1] = 'org'
        AND (storage.foldername(name))[2] IN (
          SELECT id::text FROM public.organisationen WHERE hauptansprechpartner_user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY gutachter_logos_delete ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'gutachter-logos'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.sachverstaendige WHERE user_id = auth.uid()
      )
      OR (
        (storage.foldername(name))[1] = 'org'
        AND (storage.foldername(name))[2] IN (
          SELECT id::text FROM public.organisationen WHERE hauptansprechpartner_user_id = auth.uid()
        )
      )
    )
  );
;
