-- AAR-826.6: Mietwagen-SLA + Frist-Reminder

-- ─── Job 1: SLA-Tracking (täglich 09:15) ─────────────────────────────────────
-- claim_mietwagen.status='aktiv' + dauer > erstattbar_max_tage → notification

CREATE OR REPLACE FUNCTION public.cron_mietwagen_sla_tracking()
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  IF to_regclass('public.notification_events') IS NULL THEN
    PERFORM public.log_cron_job_run('mietwagen_sla_tracking', 'success', 0, NULL,
      jsonb_build_object('note', 'notification_events nicht gefunden'));
    RETURN;
  END IF;

  WITH sla_verstossen AS (
    SELECT cm.id, cm.claim_id,
           EXTRACT(DAY FROM (now() - cm.beginn_datum::TIMESTAMPTZ))::INTEGER AS tage_bisher
      FROM public.claim_mietwagen cm
     WHERE cm.status = 'aktiv'
       AND cm.beginn_datum IS NOT NULL
       AND cm.erstattbar_max_tage IS NOT NULL
       AND EXTRACT(DAY FROM (now() - cm.beginn_datum::TIMESTAMPTZ))::INTEGER > cm.erstattbar_max_tage
       AND NOT EXISTS (
         SELECT 1 FROM public.notification_events ne
         WHERE ne.event_type = 'mietwagen.sla_verstossen'
           AND (ne.payload->>'mietwagen_id')::UUID = cm.id
           AND ne.created_at > now() - INTERVAL '24 hours'
       )
  )
  INSERT INTO public.notification_events (event_type, payload, status)
  SELECT
    'mietwagen.sla_verstossen',
    jsonb_build_object(
      'mietwagen_id', sv.id,
      'claim_id',     sv.claim_id,
      'tage_bisher',  sv.tage_bisher
    ),
    'pending'
  FROM sla_verstossen sv;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_cron_job_run('mietwagen_sla_tracking', 'success', v_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('mietwagen_sla_tracking', 'error', NULL, SQLERRM);
END $$;

SELECT cron.schedule(
  'mietwagen_sla_tracking',
  '15 9 * * *',
  $$SELECT public.cron_mietwagen_sla_tracking()$$
);

-- ─── Job 2: Lange-Anmietung-Reminder (täglich 09:20) ─────────────────────────
-- aktive Anmietung > 30d ohne Rechnung → notification

CREATE OR REPLACE FUNCTION public.cron_mietwagen_lange_anmietung()
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  IF to_regclass('public.notification_events') IS NULL THEN
    PERFORM public.log_cron_job_run('mietwagen_lange_anmietung', 'success', 0, NULL,
      jsonb_build_object('note', 'notification_events nicht gefunden'));
    RETURN;
  END IF;

  WITH lange_anmietungen AS (
    SELECT cm.id, cm.claim_id, cm.beginn_datum,
           EXTRACT(DAY FROM (now() - cm.beginn_datum::TIMESTAMPTZ))::INTEGER AS tage
      FROM public.claim_mietwagen cm
     WHERE cm.status IN ('aktiv','beendet')
       AND cm.rechnung_url IS NULL
       AND cm.beginn_datum IS NOT NULL
       AND cm.beginn_datum::TIMESTAMPTZ < now() - INTERVAL '30 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.notification_events ne
         WHERE ne.event_type = 'mietwagen.lange_anmietung'
           AND (ne.payload->>'mietwagen_id')::UUID = cm.id
           AND ne.created_at > now() - INTERVAL '7 days'
       )
  )
  INSERT INTO public.notification_events (event_type, payload, status)
  SELECT
    'mietwagen.lange_anmietung',
    jsonb_build_object(
      'mietwagen_id', la.id,
      'claim_id',     la.claim_id,
      'tage',         la.tage,
      'message',      format('Mietwagen seit %s Tagen ohne Rechnung — Status prüfen', la.tage)
    ),
    'pending'
  FROM lange_anmietungen la;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_cron_job_run('mietwagen_lange_anmietung', 'success', v_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('mietwagen_lange_anmietung', 'error', NULL, SQLERRM);
END $$;

SELECT cron.schedule(
  'mietwagen_lange_anmietung',
  '20 9 * * *',
  $$SELECT public.cron_mietwagen_lange_anmietung()$$
);

COMMENT ON FUNCTION public.cron_mietwagen_sla_tracking IS
  'AAR-826: Mietwagen aktiv + dauer > erstattbar_max_tage → SLA-Notification. Täglich 09:15.';
COMMENT ON FUNCTION public.cron_mietwagen_lange_anmietung IS
  'AAR-826: Aktive Anmietung > 30d ohne Rechnung → KB-Notification. Täglich 09:20.';
