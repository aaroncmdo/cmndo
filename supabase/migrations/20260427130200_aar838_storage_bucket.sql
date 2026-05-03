-- AAR-838: Storage-Bucket gutachten-pdfs für SV-Upload + Edge-Function-Read.
--
-- private (RLS), max 50 MB pro Datei, nur PDFs.
-- Pfad-Konvention: {claim_id}/{gutachten_id}/{run_nummer}_{hash}.pdf

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gutachten-pdfs',
  'gutachten-pdfs',
  false,
  52428800,                      -- 50 MB
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Storage-RLS (analog zu fall-dokumente-Pattern):
-- Admin: Vollzugriff
-- KB: SELECT auf eigene Claims
-- SV: INSERT/UPDATE auf eigene gutachten-Aufträge

DROP POLICY IF EXISTS "gutachten_pdfs_admin_all" ON storage.objects;
CREATE POLICY "gutachten_pdfs_admin_all" ON storage.objects
  FOR ALL USING (
    bucket_id = 'gutachten-pdfs'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
  );

DROP POLICY IF EXISTS "gutachten_pdfs_kb_select" ON storage.objects;
CREATE POLICY "gutachten_pdfs_kb_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'gutachten-pdfs'
    AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'kundenbetreuer'
    )
  );

DROP POLICY IF EXISTS "gutachten_pdfs_sv_insert" ON storage.objects;
CREATE POLICY "gutachten_pdfs_sv_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'gutachten-pdfs'
    AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'sachverstaendiger'
    )
  );

DROP POLICY IF EXISTS "gutachten_pdfs_sv_select_own" ON storage.objects;
CREATE POLICY "gutachten_pdfs_sv_select_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'gutachten-pdfs'
    AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'sachverstaendiger'
    )
  );
