-- CMM-49 Phase F (Batch C1): die 3 Cron-Funktionen faelle-frei (-> bridge bzw. obsoleten Check raus).
-- Value-neutral (bridge.fall_id == faelle.id 1:1; entfernter Check war konstant 0).

-- C1a: cron_kanzlei_paket_pending_check — faelle-JOIN (nur fuer fall_id) -> bridge.
CREATE OR REPLACE FUNCTION public.cron_kanzlei_paket_pending_check()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count int;
begin
  if to_regclass('public.notification_events') is null then
    perform public.log_cron_job_run('kanzlei_paket_pending_check', 'success', 0, null,
      jsonb_build_object('note', 'notification_events nicht gefunden'));
    return;
  end if;

  with pending_claims as (
    select
      c.id              as claim_id,
      c.kanzlei_wunsch,
      vcp.main_phase,
      vcp.sub_phase,
      b.fall_id         as fall_id,
      c.kundenbetreuer_id
      from public.claims c
      join public.faelle_claim_bridge b on b.claim_id = c.id
      left join public.v_claim_phase vcp on vcp.claim_id = c.id
     where c.kanzlei_wunsch in ('partnerkanzlei','eigene_kanzlei','nicht_gefragt')
       -- CMM-44 MP-6c: war c.phase IN ('4_gutachten_fertig','5_in_reparatur','6_kommunikation_versicherung')
       and vcp.main_phase = 'regulierung'
       and not exists (
         select 1 from public.kanzlei_pakete kp
          where kp.claim_id = c.id
            and kp.status in ('versendet','bestaetigt')
       )
       and coalesce(
             (select max(transition_at) from public.phase_transitions pt where pt.fall_id = b.fall_id),
             c.created_at
           ) < now() - interval '12 hours'
       and not exists (
         select 1 from public.notification_events ne
          where ne.event_type = 'claim.kanzlei_paket_pending'
            and (ne.payload->>'claim_id')::uuid = c.id
            and ne.created_at > now() - interval '7 days'
       )
  )
  insert into public.notification_events (event_type, payload, fall_id, status)
  select
    'claim.kanzlei_paket_pending',
    jsonb_build_object(
      'claim_id',          pc.claim_id,
      'fall_id',           pc.fall_id,
      'kanzlei_wunsch',    pc.kanzlei_wunsch,
      'main_phase',        pc.main_phase,
      'sub_phase',         pc.sub_phase,
      'kundenbetreuer_id', pc.kundenbetreuer_id
    ),
    pc.fall_id,
    'pending'
  from pending_claims pc;

  get diagnostics v_count = row_count;
  perform public.log_cron_job_run('kanzlei_paket_pending_check', 'success', v_count);
exception when others then
  perform public.log_cron_job_run('kanzlei_paket_pending_check', 'error', null, sqlerrm);
end $function$;

-- C1b: cron_vs_frist_reminder — faelle-Subquery (nur fuer fall_id) -> bridge-Subquery.
CREATE OR REPLACE FUNCTION public.cron_vs_frist_reminder()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    (SELECT b.fall_id FROM public.faelle_claim_bridge b
      WHERE b.claim_id = faellige.claim_id LIMIT 1),
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
END $function$;

-- C1c: cron_konsistenz_check — obsoleten "faelle ohne claim_id"-Check (konstant 0, stirbt im DROP) entfernt.
CREATE OR REPLACE FUNCTION public.cron_konsistenz_check()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_findings     JSONB   := '{}'::JSONB;
  v_count_total  INT     := 0;
  v_count        INT;
  v_slack_url    TEXT;
  v_response_id  BIGINT;
BEGIN
  -- CMM-49 Phase F: Check "faelle ohne claim_id" entfernt — faelle ist eingefroren, claim_id ist
  -- NOT NULL-backfilled + bridge erzwingt 1:1 (Wert war konstant 0); die Tabelle stirbt im DROP.

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
END $function$;
