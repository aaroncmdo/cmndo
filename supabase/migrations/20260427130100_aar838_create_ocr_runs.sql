-- AAR-838: ocr_runs — Audit-Trail pro OCR-Lauf (Claude Vision oder Google Vision).
--
-- Ein gutachten kann mehrere ocr_runs haben (Re-Runs nach OCR-Fail). Letzter
-- erfolgreicher Run wird via gutachten.ocr_run_id verlinkt.

CREATE TABLE IF NOT EXISTS public.ocr_runs (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gutachten_id                  UUID NOT NULL REFERENCES public.gutachten(id) ON DELETE CASCADE,
  run_nummer                    INTEGER NOT NULL,

  engine                        TEXT NOT NULL CHECK (engine IN ('claude_vision','google_vision')),
  engine_version                TEXT NOT NULL,
  prompt_hash                   TEXT,

  started_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at                   TIMESTAMPTZ,

  -- Engine-Output
  raw_response_jsonb            JSONB,
  parsed_fields_jsonb           JSONB,
  confidence_per_field_jsonb    JSONB,
  overall_confidence            NUMERIC(3,2),

  -- Plausibilitäts-Checks
  validation_errors_jsonb       JSONB,
  validation_passed             BOOLEAN,

  -- Cost-Tracking (verlinkt mit ai_usage_log wenn vorhanden)
  ai_usage_log_id               UUID,
  cost_usd                      NUMERIC(8,4),

  status                        TEXT NOT NULL DEFAULT 'running' CHECK (status IN (
                                  'running','succeeded','failed','superseded'
                                )),
  error_jsonb                   JSONB,

  triggered_by                  TEXT NOT NULL CHECK (triggered_by IN (
                                  'auto_after_upload','manual_kb_retry',
                                  'manual_admin_retry','cron_recovery'
                                )),
  triggered_by_user_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (gutachten_id, run_nummer)
);

CREATE INDEX IF NOT EXISTS idx_ocr_runs_gutachten
  ON public.ocr_runs(gutachten_id, run_nummer DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_runs_failed
  ON public.ocr_runs(status, started_at DESC)
  WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_ocr_runs_running_stuck
  ON public.ocr_runs(started_at)
  WHERE status = 'running';

-- gutachten.ocr_run_id → ocr_runs.id (zeigt auf den letzten relevanten Run).
-- ON DELETE SET NULL: wenn ocr_runs gelöscht (cascade von gutachten), bleibt
-- gutachten-Row, ocr_run_id wird NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_gutachten_ocr_run'
  ) THEN
    ALTER TABLE public.gutachten
      ADD CONSTRAINT fk_gutachten_ocr_run
      FOREIGN KEY (ocr_run_id) REFERENCES public.ocr_runs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- RLS — analog AAR-824 Profile-Pattern (has_role existiert nicht).
ALTER TABLE public.ocr_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ocr_runs_admin_all ON public.ocr_runs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);

CREATE POLICY ocr_runs_kb_select ON public.ocr_runs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.gutachten g
    JOIN public.claims c   ON c.id = g.claim_id
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE g.id = ocr_runs.gutachten_id
      AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
);

CREATE POLICY ocr_runs_sv_select ON public.ocr_runs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.gutachten g
    JOIN public.sachverstaendige sv ON sv.id = g.sv_id
    WHERE g.id = ocr_runs.gutachten_id
      AND sv.profile_id = auth.uid()
  )
);

COMMENT ON TABLE public.ocr_runs IS
  'AAR-838: Audit-Trail pro OCR-Lauf. Run_nummer inkrementiert bei Re-Run. '
  'Letzter erfolgreicher Run via gutachten.ocr_run_id verlinkt. '
  'cost_usd via ai_usage_log_id traceable.';
