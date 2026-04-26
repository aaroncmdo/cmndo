-- AAR-826.7: Konsistenz-Cron (täglich 08:00) + Slack-Alert via pg_net

CREATE OR REPLACE FUNCTION public.cron_konsistenz_check()
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_findings     JSONB   := '{}'::JSONB;
  v_count_total  INT     := 0;
  v_count        INT;
  v_slack_url    TEXT;
  v_response_id  BIGINT;
BEGIN
  -- Check 1: faelle ohne claim_id
  SELECT count(*) INTO v_count FROM public.faelle WHERE claim_id IS NULL;
  IF v_count > 0 THEN
    v_findings    := v_findings || jsonb_build_object('faelle_ohne_claim', v_count);
    v_count_total := v_count_total + v_count;
  END IF;

  -- Check 2: claims ohne vehicle_id
  SELECT count(*) INTO v_count FROM public.claims WHERE vehicle_id IS NULL;
  IF v_count > 0 THEN
    v_findings    := v_findings || jsonb_build_object('claims_ohne_vehicle', v_count);
    v_count_total := v_count_total + v_count;
  END IF;

  -- Check 3: gutachten mit claim_id die nicht existiert
  SELECT count(*) INTO v_count
    FROM public.gutachten g
   WHERE NOT EXISTS (SELECT 1 FROM public.claims c WHERE c.id = g.claim_id);
  IF v_count > 0 THEN
    v_findings    := v_findings || jsonb_build_object('gutachten_orphan', v_count);
    v_count_total := v_count_total + v_count;
  END IF;

  -- Check 4: vs_korrespondenz wartet_auf_antwort ohne Frist-Datum
  SELECT count(*) INTO v_count
    FROM public.vs_korrespondenz
   WHERE status = 'wartet_auf_antwort' AND wartet_auf_antwort_bis IS NULL;
  IF v_count > 0 THEN
    v_findings    := v_findings || jsonb_build_object('vs_wartet_ohne_frist', v_count);
    v_count_total := v_count_total + v_count;
  END IF;

  -- Check 5: claim_parties mit doppelter Hauptrolle pro claim
  SELECT count(*) INTO v_count
    FROM (
      SELECT claim_id, rolle
        FROM public.claim_parties
       WHERE rolle IN ('geschaedigter','verursacher')
       GROUP BY claim_id, rolle
       HAVING count(*) > 1
    ) doubles;
  IF v_count > 0 THEN
    v_findings    := v_findings || jsonb_build_object('claim_parties_doppelt', v_count);
    v_count_total := v_count_total + v_count;
  END IF;

  -- Check 6: repairs mit claim_id die nicht existiert
  SELECT count(*) INTO v_count
    FROM public.repairs r
   WHERE NOT EXISTS (SELECT 1 FROM public.claims c WHERE c.id = r.claim_id);
  IF v_count > 0 THEN
    v_findings    := v_findings || jsonb_build_object('repairs_orphan', v_count);
    v_count_total := v_count_total + v_count;
  END IF;

  -- Slack-Alert wenn Findings
  IF v_count_total > 0 THEN
    -- Slack-Webhook aus settings holen (falls Tabelle existiert)
    IF to_regclass('public.settings') IS NOT NULL THEN
      EXECUTE $sql$
        SELECT value FROM public.settings WHERE key = 'slack_konsistenz_webhook'
      $sql$ INTO v_slack_url;
    END IF;

    IF v_slack_url IS NOT NULL THEN
      SELECT net.http_post(
        url     := v_slack_url,
        headers := '{"Content-Type": "application/json"}'::JSONB,
        body    := jsonb_build_object(
          'text', format(
            ':warning: *Claimondo Konsistenz-Check* — %s Issues gefunden%s```%s```',
            v_count_total,
            chr(10),
            v_findings::TEXT
          )
        )::TEXT
      ) INTO v_response_id;
    END IF;
  END IF;

  PERFORM public.log_cron_job_run(
    'konsistenz_check', 'success', v_count_total, NULL, v_findings
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('konsistenz_check', 'error', NULL, SQLERRM);
END $$;

SELECT cron.schedule(
  'konsistenz_check',
  '0 8 * * *',
  $$SELECT public.cron_konsistenz_check()$$
);

COMMENT ON FUNCTION public.cron_konsistenz_check IS
  'AAR-826: Tägliche Konsistenz-Prüfung (faelle/claims/gutachten/vs_korrespondenz). '
  'Slack-Alert via pg_net wenn Findings. Ergebnis in cron_jobs_audit.metadata_jsonb.';
