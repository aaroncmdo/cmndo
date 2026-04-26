-- AAR-821: gutachten_fotos — Schadensfotos zu einem Gutachten
--
-- upload_quelle unterscheidet wer die Fotos hochgeladen hat (SV, Läufer, Kunde, Admin).
-- Storage-URLs zeigen auf Supabase Storage Bucket 'gutachten-fotos'.

CREATE TABLE IF NOT EXISTS public.gutachten_fotos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gutachten_id      UUID NOT NULL REFERENCES public.gutachten(id) ON DELETE CASCADE,
  claim_id          UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,

  -- Upload-Quelle
  upload_quelle     TEXT NOT NULL CHECK (upload_quelle IN ('sv','laeufer','kunde','admin')),
  uploaded_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Datei
  storage_path      TEXT NOT NULL,
  original_filename TEXT,
  mime_type         TEXT,
  file_size_bytes   INTEGER,

  -- Metadaten
  aufnahme_zeitpunkt  TIMESTAMPTZ,
  beschreibung        TEXT,
  position_nr         INTEGER,  -- optionaler Bezug zu gutachten_positionen.position_nr

  -- Audit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gf_gutachten ON public.gutachten_fotos(gutachten_id);
CREATE INDEX IF NOT EXISTS idx_gf_claim     ON public.gutachten_fotos(claim_id);
CREATE INDEX IF NOT EXISTS idx_gf_quelle    ON public.gutachten_fotos(upload_quelle);

-- RLS
ALTER TABLE public.gutachten_fotos ENABLE ROW LEVEL SECURITY;

CREATE POLICY gf_admin_all ON public.gutachten_fotos FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);
CREATE POLICY gf_kb_own ON public.gutachten_fotos FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.claims c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = gutachten_fotos.claim_id AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.claims c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = gutachten_fotos.claim_id AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
);
CREATE POLICY gf_sv_own ON public.gutachten_fotos FOR ALL USING (
  gutachten_id IN (
    SELECT g.id FROM public.gutachten g
    JOIN public.sachverstaendige sv ON sv.id = g.sv_id
    WHERE sv.profile_id = auth.uid()
  )
) WITH CHECK (
  gutachten_id IN (
    SELECT g.id FROM public.gutachten g
    JOIN public.sachverstaendige sv ON sv.id = g.sv_id
    WHERE sv.profile_id = auth.uid()
  )
);
-- Kunde darf eigene Uploads lesen
CREATE POLICY gf_kunde_own ON public.gutachten_fotos FOR SELECT USING (
  upload_quelle = 'kunde' AND uploaded_by = auth.uid()
);

COMMENT ON TABLE public.gutachten_fotos IS
  'AAR-821: Schadensfotos zu einem Gutachten. '
  'upload_quelle: sv/laeufer/kunde/admin. Storage-Bucket: gutachten-fotos. '
  'Keine eigene Phase-Kopplung — läuft über gutachten.status.';
