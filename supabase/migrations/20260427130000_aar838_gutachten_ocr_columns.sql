-- AAR-838: gutachten-Erweiterung um OCR-Pipeline-Felder
--
-- Vorhandenes Feld bericht_pdf_url wird wiederverwendet als pdf-Storage-Pfad.
-- Neu hinzu: PDF-Metadaten + OCR-Status + Anbieter-Detection + Feld-Quelle-Tracking.

ALTER TABLE public.gutachten
  -- PDF-Upload-Metadaten (bericht_pdf_url existiert schon als Storage-Pfad)
  ADD COLUMN IF NOT EXISTS pdf_uploaded_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pdf_uploaded_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pdf_size_bytes          INTEGER,
  ADD COLUMN IF NOT EXISTS pdf_seiten_count        INTEGER,

  -- OCR-Status + Engine
  ADD COLUMN IF NOT EXISTS ocr_status              TEXT NOT NULL DEFAULT 'nicht_gestartet',
  ADD COLUMN IF NOT EXISTS ocr_engine              TEXT,
  ADD COLUMN IF NOT EXISTS ocr_engine_version      TEXT,
  ADD COLUMN IF NOT EXISTS ocr_started_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ocr_finished_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ocr_run_id              UUID,
  ADD COLUMN IF NOT EXISTS ocr_confidence          NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS ocr_error_jsonb         JSONB,

  -- Anbieter-Detection
  ADD COLUMN IF NOT EXISTS gutachter_anbieter      TEXT,

  -- Feld-Quelle-Tracking (welcher Wert kam vom OCR vs. manuell)
  ADD COLUMN IF NOT EXISTS felder_quelle_jsonb     JSONB,

  -- UI-Hints für SV-/KB-Editierbarkeit
  ADD COLUMN IF NOT EXISTS editable_for_sv         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS editable_for_kb         BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.gutachten DROP CONSTRAINT IF EXISTS gutachten_ocr_status_check;
ALTER TABLE public.gutachten ADD CONSTRAINT gutachten_ocr_status_check CHECK (
  ocr_status = ANY (ARRAY[
    'nicht_gestartet','pending','running','done','failed','manuell_uebersteuert'
  ])
);

ALTER TABLE public.gutachten DROP CONSTRAINT IF EXISTS gutachten_ocr_engine_check;
ALTER TABLE public.gutachten ADD CONSTRAINT gutachten_ocr_engine_check CHECK (
  ocr_engine IS NULL OR ocr_engine = ANY (ARRAY[
    'claude_vision','google_vision','manual'
  ])
);

ALTER TABLE public.gutachten DROP CONSTRAINT IF EXISTS gutachten_anbieter_check;
ALTER TABLE public.gutachten ADD CONSTRAINT gutachten_anbieter_check CHECK (
  gutachter_anbieter IS NULL OR gutachter_anbieter = ANY (ARRAY[
    'audatex','dat','combiplus','solera','schwacke','sonstiges','unbekannt'
  ])
);

CREATE INDEX IF NOT EXISTS idx_gutachten_ocr_pending
  ON public.gutachten(ocr_status)
  WHERE ocr_status IN ('pending','running');
CREATE INDEX IF NOT EXISTS idx_gutachten_pdf_uploaded
  ON public.gutachten(pdf_uploaded_at DESC)
  WHERE pdf_uploaded_at IS NOT NULL;

COMMENT ON COLUMN public.gutachten.felder_quelle_jsonb IS
  'AAR-838: Pro Feld dokumentiert ob Wert vom OCR oder manuell kam. '
  'Schema: { "wbw_brutto": "ocr", "rk_netto": "ocr_manual_korrigiert", "schadenort_text": "manual" }';
COMMENT ON COLUMN public.gutachten.editable_for_sv IS
  'AAR-838: SV darf nur PDF (re-)hochladen, alle Felder kommen aus dem PDF. '
  'editable_for_sv=FALSE als Default — UI rendert Felder read-only für SV.';
