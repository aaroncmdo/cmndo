-- Armiert den Fallback-Tick fuer den Notification-Worker via pg_cron (Muster:
-- cron_trigger_release_provisionen / cron_trigger_exif_worker).
--
-- WARUM: /api/notifications/process wird bislang NUR vom fire-and-forget-POST aus emitEvent()
-- getroffen. Empirisch belegt (prod, 20.07.): alle 7 notification_events wurden in 0,48-0,59 s
-- verarbeitet = ausschliesslich der Inline-POST; kein einziges Event kam je ueber einen Batch-Tick.
-- Der in docs/vps-crontab.md dokumentierte '*/10 cron-call.sh /api/notifications/process' ist auf
-- dem Live-VPS NICHT wirksam (Snapshot-Drift oder stiller Fehlschlag — cron-call.sh nutzt curl -sf,
-- ein 401/404 bleibt ohne Output/Alert). Gegenprobe: die VPS-Crontab LEBT (pipeline-health schrieb
-- zuletzt 2026-07-19 23:00:04 in health_check_runs) -> es fehlt genau diese eine Zeile in ihrer Wirkung.
-- Folge ohne Tick: der Retry-Backoff (1min->5min->30min->2h->dead-letter) im Worker ist toter Code —
-- jedes Event, dessen Sofort-POST fehlschlaegt (Deploy-Restart/Netz-Blip), bleibt fuer immer pending.
--
-- Doppel-Tick unkritisch: claimPendingEvents() claimt per status-gefiltertem UPDATE (+Lease); ein
-- zweiter Worker bekommt 0 Rows zurueck. Sollte die VPS-Zeile also doch (wieder) greifen, ist die
-- Redundanz fuer einen Fallback-Tick gewollt und korrekt.
--
-- GUARD: fehlt das Vault-Secret -> dormant-no-op (kein Fehler, kein Tick), bis es geseedet wird.
CREATE OR REPLACE FUNCTION public.cron_trigger_notification_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_faellig     INT;
  v_secret      TEXT;
  v_response_id BIGINT;
  v_url         TEXT := 'https://app.claimondo.de/api/notifications/process';
BEGIN
  -- Nur ticken wenn es Arbeit gibt. Spiegelt den claimFilter der Route
  -- (route.ts:182-185): pending | failed+retry-faellig | processing mit abgelaufener Lease.
  SELECT count(*) INTO v_faellig
  FROM public.notification_events
  WHERE status = 'pending'
     OR (status = 'failed'     AND next_retry_at IS NOT NULL AND next_retry_at <= now())
     OR (status = 'processing' AND next_retry_at IS NOT NULL AND next_retry_at <= now());

  IF v_faellig = 0 THEN
    PERFORM public.log_cron_job_run('notification_worker_tick', 'success', 0);
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
  IF v_secret IS NULL THEN
    PERFORM public.log_cron_job_run('notification_worker_tick', 'success', v_faellig,
      'cron_secret fehlt im Vault - Notification-Tick dormant bis seed');
    RETURN;
  END IF;

  -- Die Route erwartet bei GET exakt 'Authorization: Bearer <CRON_SECRET>' (route.ts:267-269).
  SELECT net.http_get(
    url     := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'x-source', 'pg_cron')
  ) INTO v_response_id;

  PERFORM public.log_cron_job_run('notification_worker_tick', 'success', v_faellig, NULL,
    jsonb_build_object('response_id', v_response_id));
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('notification_worker_tick', 'error', NULL, SQLERRM);
END
$fn$;

-- Replay-Toleranz (Preview-Chain-Fix 17.07., Muster wie 20260719132941): pg_cron ist cluster-weit
-- nur auf Prod/Staging installiert, NICHT in Supabase-Preview-Branches / From-Scratch-Replays ->
-- Schema "cron" fehlt dort -> ungeguardetes cron.job/cron.schedule bricht den Replay (SQLSTATE 3F000).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification_worker_tick') THEN
      PERFORM cron.unschedule('notification_worker_tick');
    END IF;
    PERFORM cron.schedule('notification_worker_tick', '*/5 * * * *', $cron$SELECT public.cron_trigger_notification_worker()$cron$);
  ELSE
    RAISE NOTICE 'pg_cron nicht installiert - Cron-Job notification_worker_tick uebersprungen (Preview/lokal)';
  END IF;
END $$;
