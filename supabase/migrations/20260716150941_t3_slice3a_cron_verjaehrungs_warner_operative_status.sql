-- T3-slice-3a: cron_verjaehrungs_warner von claims.status auf operative_status (Status-Achsen T3).
-- Fixt ZWEI Live-Bugs des alten Filters `c.status NOT IN ('reguliert','abgelehnt','an_externe_kanzlei_uebergeben','storniert')`:
--   (1) status=NULL (praktisch alle aktiven Claims) -> `NULL NOT IN (...)` = NULL -> Row gefiltert
--       -> aktive Claims bekamen NIE eine Verjaehrungs-Warnung (Kernzweck verfehlt).
--   (2) Stale-Werte: 'reguliert' existiert nicht (heisst reguliert_vollstaendig), 'abgelehnt' ist seit
--       B4-slice-1b NON-terminal (nachforderbar) und gehoert weiter gewarnt.
-- Neu: Ausschluss = CLOSED_OPERATIVE_STATUS (Spiegel src/lib/claims/terminal-status.ts); NULL zaehlt als aktiv.
CREATE OR REPLACE FUNCTION public.cron_verjaehrungs_warner() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
     WHERE (c.operative_status IS NULL
            OR c.operative_status NOT IN ('abgeschlossen','storniert','reguliert_vollstaendig','klage_rechtsstreit','verjaehrt','abgelehnt_final','an_externe_kanzlei_uebergeben','termin_durchgefuehrt'))
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

COMMENT ON FUNCTION public.cron_verjaehrungs_warner() IS 'AAR-826/AAR-839 + T3-slice-3a: Cron warnt 90 Tage vor verjaehrt_am via notification_events. Aktiv-Filter auf operative_status (NOT IN CLOSED_OPERATIVE_STATUS; NULL = aktiv). Non-terminale Endzustaende (in_kommunikation_vs, abgelehnt) werden bewusst gewarnt.';
