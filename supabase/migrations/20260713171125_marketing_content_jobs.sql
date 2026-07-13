-- Marketing Content-Studio Slice 1: Job-Tabelle + Storage-Bucket
CREATE TABLE public.marketing_content_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thema text NOT NULL,
  format text NOT NULL DEFAULT 'ratgeber' CHECK (format IN ('ratgeber','ad')),
  status text NOT NULL DEFAULT 'entwurf' CHECK (status IN ('entwurf','skript_generiert','audio_erzeugt','video_fertig','fehler')),
  skript jsonb,
  caption text,
  hashtags text[],
  audio_url text,
  video_url text,
  dauer_sekunden integer,
  ist_ki_generiert boolean NOT NULL DEFAULT true,
  kosten_cents integer,
  fehler_text text,
  erstellt_von uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_content_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketing_content_jobs_admin_all
  ON public.marketing_content_jobs
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE INDEX idx_marketing_content_jobs_status ON public.marketing_content_jobs (status);
CREATE INDEX idx_marketing_content_jobs_erstellt_am ON public.marketing_content_jobs (erstellt_am DESC);

-- Storage-Bucket (oeffentlich lesbar; Schreiben nur Admin)
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-content', 'marketing-content', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY marketing_content_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketing-content' AND is_admin());
CREATE POLICY marketing_content_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'marketing-content' AND is_admin());
CREATE POLICY marketing_content_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'marketing-content' AND is_admin());
