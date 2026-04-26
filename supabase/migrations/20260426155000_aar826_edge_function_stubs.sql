-- AAR-826.9: pg_cron-Trigger für Edge Functions (EXIF-Worker + Salesforce-Sync)
--
-- Die eigentliche Arbeit machen Edge Functions in:
--   supabase/functions/exif-worker/index.ts
--   supabase/functions/salesforce-sync/index.ts
-- Diese pg_cron-Jobs triggern sie via pg_net.http_post().
-- Edge-Function-URLs kommen aus der settings-Tabelle (Key: edge_fn_exif_worker_url usw.)

-- ─── Job 1: EXIF-Worker-Trigger (alle 5 Minuten) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.cron_trigger_exif_worker()
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_url         TEXT;
  v_pending     INT;
  v_response_id BIGINT;
BEGIN
  SELECT count(*) INTO v_pending
    FROM public.gutachten_fotos
   WHERE exif_processed = FALSE;

  -- Kein Trigger wenn keine pending Fotos
  IF v_pending = 0 THEN
    PERFORM public.log_cron_job_run('exif_worker_trigger', 'success', 0);
    RETURN;
  END IF;

  -- URL aus settings laden
  IF to_regclass('public.settings') IS NOT NULL THEN
    EXECUTE $sql$ SELECT value FROM public.settings WHERE key = 'edge_fn_exif_worker_url' $sql$
    INTO v_url;
  END IF;

  IF v_url IS NULL THEN
    PERFORM public.log_cron_job_run(
      'exif_worker_trigger', 'error', v_pending,
      'edge_fn_exif_worker_url nicht in settings konfiguriert'
    );
    RETURN;
  END IF;

  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-source',     'pg_cron'
    ),
    body    := jsonb_build_object('pending', v_pending)::TEXT
  ) INTO v_response_id;

  PERFORM public.log_cron_job_run(
    'exif_worker_trigger', 'success', v_pending, NULL,
    jsonb_build_object('response_id', v_response_id)
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('exif_worker_trigger', 'error', NULL, SQLERRM);
END $$;

SELECT cron.schedule(
  'exif_worker_trigger',
  '*/5 * * * *',
  $$SELECT public.cron_trigger_exif_worker()$$
);

-- ─── Job 2: Salesforce-Sync-Trigger (alle 15 Minuten) ────────────────────────

CREATE OR REPLACE FUNCTION public.cron_trigger_salesforce_sync()
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_url         TEXT;
  v_pending     INT;
  v_response_id BIGINT;
BEGIN
  IF to_regclass('public.notification_events') IS NULL THEN
    PERFORM public.log_cron_job_run('salesforce_sync_trigger', 'success', 0);
    RETURN;
  END IF;

  SELECT count(*) INTO v_pending
    FROM public.notification_events
   WHERE event_type = 'vs_korrespondenz.salesforce_sync_pending'
     AND status = 'pending';

  IF v_pending = 0 THEN
    PERFORM public.log_cron_job_run('salesforce_sync_trigger', 'success', 0);
    RETURN;
  END IF;

  IF to_regclass('public.settings') IS NOT NULL THEN
    EXECUTE $sql$ SELECT value FROM public.settings WHERE key = 'edge_fn_salesforce_sync_url' $sql$
    INTO v_url;
  END IF;

  IF v_url IS NOT NULL THEN
    SELECT net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-source', 'pg_cron'),
      body    := jsonb_build_object('pending_count', v_pending)::TEXT
    ) INTO v_response_id;
  END IF;

  PERFORM public.log_cron_job_run(
    'salesforce_sync_trigger', 'success', v_pending, NULL,
    jsonb_build_object('response_id', v_response_id)
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('salesforce_sync_trigger', 'error', NULL, SQLERRM);
END $$;

SELECT cron.schedule(
  'salesforce_sync_trigger',
  '*/15 * * * *',
  $$SELECT public.cron_trigger_salesforce_sync()$$
);

DO $$
BEGIN
  RAISE NOTICE '
    AAR-826.9 pg_cron-Trigger für Edge Functions registriert.

    Edge Functions müssen deployed werden:
      supabase/functions/exif-worker/index.ts
      supabase/functions/salesforce-sync/index.ts

    Settings-Keys konfigurieren (Supabase Dashboard > Table Editor > settings):
      edge_fn_exif_worker_url     = https://<ref>.supabase.co/functions/v1/exif-worker
      edge_fn_salesforce_sync_url = https://<ref>.supabase.co/functions/v1/salesforce-sync
      slack_konsistenz_webhook    = https://hooks.slack.com/services/...

    Solange URLs fehlen: Jobs laufen (Audit-Log) aber triggern keine HTTP-Calls.';
END $$;

COMMENT ON FUNCTION public.cron_trigger_exif_worker IS
  'AAR-826: Triggert Edge Function exif-worker wenn pending gutachten_fotos vorhanden. Alle 5min.';
COMMENT ON FUNCTION public.cron_trigger_salesforce_sync IS
  'AAR-826: Triggert Edge Function salesforce-sync bei pending notification_events. Alle 15min.';
