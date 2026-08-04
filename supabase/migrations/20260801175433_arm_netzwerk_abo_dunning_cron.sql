-- P5 T6a: reminder_typ-CHECK um die Netzwerk-Dunning-Stufen erweitern (Preflight-Fund:
-- der CHECK existiert — ohne Erweiterung waeren die neuen Werte Silent-Fails).
alter table public.sv_payment_reminders
  drop constraint sv_payment_reminders_reminder_typ_check,
  add  constraint sv_payment_reminders_reminder_typ_check
       check (reminder_typ in (
         'email_3d','email_7d','email_14d','admin_task_call_3d','admin_task_call_10d','final_warnung',
         'netzwerk_abo_ueberfaellig_1d','netzwerk_abo_ueberfaellig_5d','netzwerk_abo_ueberfaellig_10d'
       ));

-- P5 T6b: Dunning-Cron (Muster cron_trigger_release_provisionen: Vault-Secret + net.http_get).
CREATE OR REPLACE FUNCTION public.cron_trigger_netzwerk_abo_dunning()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_secret TEXT; v_response_id BIGINT;
  v_url TEXT := 'https://app.claimondo.de/api/cron/netzwerk-abo-dunning';
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
  IF v_secret IS NULL THEN
    PERFORM public.log_cron_job_run('netzwerk_abo_dunning', 'success', 0, 'cron_secret fehlt im Vault - dormant bis seed');
    RETURN;
  END IF;
  SELECT net.http_get(url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'x-source', 'pg_cron')) INTO v_response_id;
  PERFORM public.log_cron_job_run('netzwerk_abo_dunning', 'success', NULL, NULL, jsonb_build_object('response_id', v_response_id));
EXCEPTION WHEN OTHERS THEN PERFORM public.log_cron_job_run('netzwerk_abo_dunning', 'error', NULL, SQLERRM);
END $fn$;

-- Preview-Replay-Guard: pg_cron existiert in Previews nicht (3F000-Falle).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'netzwerk_abo_dunning') THEN
      PERFORM cron.unschedule('netzwerk_abo_dunning');
    END IF;
    PERFORM cron.schedule('netzwerk_abo_dunning', '0 8 * * *', $cron$SELECT public.cron_trigger_netzwerk_abo_dunning()$cron$);
  ELSE
    RAISE NOTICE 'pg_cron nicht installiert - Cron netzwerk_abo_dunning uebersprungen (Preview/lokal)';
  END IF;
END $$;