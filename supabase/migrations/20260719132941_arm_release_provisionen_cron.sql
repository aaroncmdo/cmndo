-- Armiert den unified FG4-A Provisions-Release-Cron via pg_cron (Muster cron_trigger_exif_worker).
-- Die Route /api/cron/release-provisionen ist CRON_SECRET-gated (assertCronAuth) → Bearer aus Supabase
-- VAULT (secret name 'cron_secret'). GUARD: fehlt das Secret → dormant-no-op (kein Fehler, kein Release),
-- bis es EINMAL geseedet wird (vault.create_secret). Erster Lauf ist ohnehin no-op (pending nicht past-hold).
CREATE OR REPLACE FUNCTION public.cron_trigger_release_provisionen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_pending     INT;
  v_secret      TEXT;
  v_response_id BIGINT;
  v_url         TEXT := 'https://app.claimondo.de/api/cron/release-provisionen';
BEGIN
  SELECT count(*) INTO v_pending FROM public.partner_provisionen WHERE status = 'pending';
  IF v_pending = 0 THEN
    PERFORM public.log_cron_job_run('release_provisionen', 'success', 0);
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
  IF v_secret IS NULL THEN
    PERFORM public.log_cron_job_run('release_provisionen', 'success', v_pending,
      'cron_secret fehlt im Vault - Release-Cron dormant bis seed');
    RETURN;
  END IF;

  SELECT net.http_get(
    url     := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'x-source', 'pg_cron')
  ) INTO v_response_id;

  PERFORM public.log_cron_job_run('release_provisionen', 'success', v_pending, NULL,
    jsonb_build_object('response_id', v_response_id));
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('release_provisionen', 'error', NULL, SQLERRM);
END
$fn$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'release_provisionen') THEN
    PERFORM cron.unschedule('release_provisionen');
  END IF;
END $$;

SELECT cron.schedule('release_provisionen', '0 2 * * *', 'SELECT public.cron_trigger_release_provisionen()');
