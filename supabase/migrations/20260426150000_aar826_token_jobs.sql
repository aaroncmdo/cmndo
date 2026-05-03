-- AAR-826.4: Airdrop-Token Cron-Jobs

-- ─── Job 1: Token-Expiry (stündlich) ─────────────────────────────────────────
-- airdrop_invitations.status='offen' + expires_at < now() → 'abgelaufen'

CREATE OR REPLACE FUNCTION public.cron_airdrop_token_expiry()
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.airdrop_invitations
     SET status       = 'abgelaufen',
         abgelaufen_am = now()
   WHERE status IN ('offen','geoeffnet')
     AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.log_cron_job_run(
    'airdrop_token_expiry', 'success', v_count,
    NULL, jsonb_build_object('run_at', now())
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('airdrop_token_expiry', 'error', NULL, SQLERRM);
END $$;

SELECT cron.schedule(
  'airdrop_token_expiry',
  '0 * * * *',
  $$SELECT public.cron_airdrop_token_expiry()$$
);

-- ─── Job 2: Token-Cleanup (täglich 03:00) ────────────────────────────────────
-- status='abgelaufen' + abgelaufen_am > 30d → DELETE

CREATE OR REPLACE FUNCTION public.cron_airdrop_token_cleanup()
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  DELETE FROM public.airdrop_invitations
   WHERE status = 'abgelaufen'
     AND (
       abgelaufen_am < now() - INTERVAL '30 days'
       OR (abgelaufen_am IS NULL AND expires_at < now() - INTERVAL '30 days')
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.log_cron_job_run('airdrop_token_cleanup', 'success', v_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('airdrop_token_cleanup', 'error', NULL, SQLERRM);
END $$;

SELECT cron.schedule(
  'airdrop_token_cleanup',
  '0 3 * * *',
  $$SELECT public.cron_airdrop_token_cleanup()$$
);

-- ─── Job 3: Rate-Limit-Reset (täglich Mitternacht) ───────────────────────────

CREATE OR REPLACE FUNCTION public.cron_rate_limit_reset()
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.log_cron_job_run(
    'rate_limit_reset', 'success', 0, NULL,
    jsonb_build_object('note', 'Rate-Limits sind query-basiert — kein Tabellen-Cleanup nötig')
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('rate_limit_reset', 'error', NULL, SQLERRM);
END $$;

SELECT cron.schedule(
  'rate_limit_reset',
  '0 0 * * *',
  $$SELECT public.cron_rate_limit_reset()$$
);

COMMENT ON FUNCTION public.cron_airdrop_token_expiry IS
  'AAR-826: Setzt abgelaufene Einladungen auf status=abgelaufen. Stündlich.';
COMMENT ON FUNCTION public.cron_airdrop_token_cleanup IS
  'AAR-826: Löscht Einladungen die > 30d abgelaufen sind. Täglich 03:00.';
