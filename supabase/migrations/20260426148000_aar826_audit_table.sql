-- AAR-826.2: cron_jobs_audit — Single-Source-of-Truth für Cron-Health

CREATE TABLE IF NOT EXISTS public.cron_jobs_audit (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name       TEXT NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at       TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running','success','error','timeout')),
  rows_processed INTEGER,
  error_message  TEXT,
  duration_ms    INTEGER,
  metadata_jsonb JSONB
);

CREATE INDEX IF NOT EXISTS idx_cron_audit_job_started
  ON public.cron_jobs_audit(job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_audit_status
  ON public.cron_jobs_audit(status) WHERE status IN ('error','timeout','running');

ALTER TABLE public.cron_jobs_audit ENABLE ROW LEVEL SECURITY;

-- Nur Admin liest (Monitoring-Dashboard)
CREATE POLICY cron_audit_admin_select ON public.cron_jobs_audit
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
  );

-- Helper-Function: einheitliches Audit-Logging für alle Cron-Jobs
CREATE OR REPLACE FUNCTION public.log_cron_job_run(
  p_job_name TEXT,
  p_status   TEXT    DEFAULT 'success',
  p_rows     INTEGER DEFAULT NULL,
  p_error    TEXT    DEFAULT NULL,
  p_metadata JSONB   DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.cron_jobs_audit (
    job_name, started_at, ended_at, status,
    rows_processed, error_message, metadata_jsonb, duration_ms
  )
  VALUES (
    p_job_name, now(), now(), p_status,
    p_rows, p_error, p_metadata, 0
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

COMMENT ON TABLE public.cron_jobs_audit IS
  'AAR-826: Audit jedes Cron-Job-Runs. Status running/success/error/timeout. '
  'Schreibend: service_role via log_cron_job_run(). Lesend: Admin-Dashboard.';

COMMENT ON FUNCTION public.log_cron_job_run IS
  'AAR-826: Einheitliches Audit-Logging für alle Cron-Jobs. SECURITY DEFINER damit pg_cron-Jobs ohne RLS schreiben können.';
