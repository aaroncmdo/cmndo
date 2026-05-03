-- AAR-826.5: VS-Korrespondenz Cron-Jobs + Pflicht-Foto-Validation

-- ─── Job 1: VS-Frist-Tick (alle 6 Stunden) ───────────────────────────────────
-- wartet_auf_antwort + Frist abgelaufen → ohne_antwort_abgelaufen

CREATE OR REPLACE FUNCTION public.cron_vs_frist_tick()
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.vs_korrespondenz
     SET status = 'ohne_antwort_abgelaufen'
   WHERE status = 'wartet_auf_antwort'
     AND wartet_auf_antwort_bis IS NOT NULL
     AND wartet_auf_antwort_bis < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.log_cron_job_run('vs_frist_tick', 'success', v_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('vs_frist_tick', 'error', NULL, SQLERRM);
END $$;

SELECT cron.schedule(
  'vs_frist_tick',
  '0 */6 * * *',
  $$SELECT public.cron_vs_frist_tick()$$
);

-- ─── Job 2: VS-Frist-Reminder (täglich 09:00) ────────────────────────────────
-- 3 Tage vor Frist-Ablauf: notification_event an KB

CREATE OR REPLACE FUNCTION public.cron_vs_frist_reminder()
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  IF to_regclass('public.notification_events') IS NULL THEN
    PERFORM public.log_cron_job_run(
      'vs_frist_reminder', 'success', 0, NULL,
      jsonb_build_object('note', 'notification_events-Tabelle nicht gefunden — NoOp')
    );
    RETURN;
  END IF;

  WITH faellige AS (
    SELECT vk.id, vk.claim_id, vk.typ, vk.wartet_auf_antwort_bis,
           EXTRACT(DAY FROM (vk.wartet_auf_antwort_bis - now()))::INTEGER AS tage_bis_frist
      FROM public.vs_korrespondenz vk
     WHERE vk.status = 'wartet_auf_antwort'
       AND vk.wartet_auf_antwort_bis BETWEEN now() AND now() + INTERVAL '3 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.notification_events ne
         WHERE ne.event_type = 'vs_korrespondenz.frist_in_3_tagen'
           AND (ne.payload->>'korrespondenz_id')::UUID = vk.id
           AND ne.created_at > now() - INTERVAL '24 hours'
       )
  )
  INSERT INTO public.notification_events (event_type, fall_id, payload, status)
  SELECT
    'vs_korrespondenz.frist_in_3_tagen',
    (SELECT f.id FROM public.faelle f
      JOIN public.claims c ON c.id = faellige.claim_id
      WHERE f.claim_id = faellige.claim_id LIMIT 1),
    jsonb_build_object(
      'korrespondenz_id', faellige.id,
      'claim_id', faellige.claim_id,
      'typ', faellige.typ,
      'frist_bis', faellige.wartet_auf_antwort_bis,
      'tage_bis_frist', faellige.tage_bis_frist
    ),
    'pending'
  FROM faellige;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_cron_job_run('vs_frist_reminder', 'success', v_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('vs_frist_reminder', 'error', NULL, SQLERRM);
END $$;

SELECT cron.schedule(
  'vs_frist_reminder',
  '0 9 * * *',
  $$SELECT public.cron_vs_frist_reminder()$$
);

-- ─── Job 3: Verjährungs-Warner (täglich 09:30) ───────────────────────────────
-- claims.verjaehrt_am < now() + 90d → notification_event

CREATE OR REPLACE FUNCTION public.cron_verjaehrungs_warner()
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  IF to_regclass('public.notification_events') IS NULL THEN
    PERFORM public.log_cron_job_run('verjaehrungs_warner', 'success', 0, NULL,
      jsonb_build_object('note', 'notification_events nicht gefunden'));
    RETURN;
  END IF;

  WITH bald_verjaehrt AS (
    SELECT c.id, c.verjaehrt_am, c.vehicle_id,
           EXTRACT(DAY FROM (c.verjaehrt_am::TIMESTAMPTZ - now()))::INTEGER AS tage_bis_verjaehrt
      FROM public.claims c
     WHERE c.status NOT IN ('abgeschlossen','storniert')
       AND c.verjaehrt_am IS NOT NULL
       AND c.verjaehrt_am::TIMESTAMPTZ BETWEEN now() AND now() + INTERVAL '90 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.notification_events ne
         WHERE ne.event_type = 'claim.verjaehrung_naht'
           AND (ne.payload->>'claim_id')::UUID = c.id
           AND ne.created_at > now() - INTERVAL '7 days'
       )
  )
  INSERT INTO public.notification_events (event_type, payload, status)
  SELECT
    'claim.verjaehrung_naht',
    jsonb_build_object(
      'claim_id',            bv.id,
      'vehicle_id',          bv.vehicle_id,
      'verjaehrt_am',        bv.verjaehrt_am,
      'tage_bis_verjaehrt',  bv.tage_bis_verjaehrt
    ),
    'pending'
  FROM bald_verjaehrt bv;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_cron_job_run('verjaehrungs_warner', 'success', v_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('verjaehrungs_warner', 'error', NULL, SQLERRM);
END $$;

SELECT cron.schedule(
  'verjaehrungs_warner',
  '30 9 * * *',
  $$SELECT public.cron_verjaehrungs_warner()$$
);

-- ─── Job 4: Pflicht-Foto-Validation (stündlich) ──────────────────────────────
-- gutachten ohne Pflicht-Foto 'uebersicht' seit > 24h → notification_event

CREATE OR REPLACE FUNCTION public.cron_pflicht_foto_validation()
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  IF to_regclass('public.notification_events') IS NULL THEN
    PERFORM public.log_cron_job_run('pflicht_foto_validation', 'success', 0, NULL,
      jsonb_build_object('note', 'notification_events nicht gefunden'));
    RETURN;
  END IF;

  WITH unvollstaendig AS (
    SELECT g.id AS gutachten_id, g.claim_id
      FROM public.gutachten g
     WHERE g.created_at < now() - INTERVAL '24 hours'
       AND g.status NOT IN ('storniert','final')
       AND NOT EXISTS (
         SELECT 1 FROM public.gutachten_fotos gf
         WHERE gf.gutachten_id = g.id AND gf.kategorie = 'uebersicht'
       )
  )
  INSERT INTO public.notification_events (event_type, payload, status)
  SELECT
    'gutachten.pflicht_fotos_unvollstaendig',
    jsonb_build_object('gutachten_id', u.gutachten_id, 'claim_id', u.claim_id),
    'pending'
  FROM unvollstaendig u
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notification_events ne
    WHERE ne.event_type = 'gutachten.pflicht_fotos_unvollstaendig'
      AND (ne.payload->>'gutachten_id')::UUID = u.gutachten_id
      AND ne.created_at > now() - INTERVAL '12 hours'
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_cron_job_run('pflicht_foto_validation', 'success', v_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('pflicht_foto_validation', 'error', NULL, SQLERRM);
END $$;

SELECT cron.schedule(
  'pflicht_foto_validation',
  '0 * * * *',
  $$SELECT public.cron_pflicht_foto_validation()$$
);

COMMENT ON FUNCTION public.cron_vs_frist_tick IS
  'AAR-826: wartet_auf_antwort + Frist abgelaufen → ohne_antwort_abgelaufen. Alle 6h.';
COMMENT ON FUNCTION public.cron_vs_frist_reminder IS
  'AAR-826: 3-Tage-Frist-Reminder an KB via notification_events. Täglich 09:00.';
COMMENT ON FUNCTION public.cron_verjaehrungs_warner IS
  'AAR-826: Verjährungs-Alert wenn claims.verjaehrt_am < jetzt + 90d. Täglich 09:30.';
COMMENT ON FUNCTION public.cron_pflicht_foto_validation IS
  'AAR-826: Gutachten ohne Pflicht-Foto uebersicht > 24h → notification. Stündlich.';
