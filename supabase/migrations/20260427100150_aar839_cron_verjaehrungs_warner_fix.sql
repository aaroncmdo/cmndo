-- AAR-839 Step 3/8: cron_verjaehrungs_warner anpassen
--
-- Pre-Flight-Befund: Diese Function (aus AAR-826) referenziert den alten
-- Status 'abgeschlossen' der mit AAR-839 wegfällt. Anpassung auf das neue
-- Endzustand-Set (alle 4 finalen Status).
--
-- Signatur unverändert — CREATE OR REPLACE ist sicher (Trigger/pg_cron-
-- Schedule binden an proname, nicht an OID, aber die Replace-Variante
-- behält die Function-OID ohnehin bei).

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
     WHERE c.status NOT IN ('reguliert','abgelehnt','an_externe_kanzlei_uebergeben','storniert')
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

COMMENT ON FUNCTION public.cron_verjaehrungs_warner IS
  'AAR-826/AAR-839: Cron warnt 90 Tage vor verjaehrt_am via notification_events. '
  'Filter auf neuen Endzustand-Set (reguliert/abgelehnt/an_externe_kanzlei_uebergeben/storniert).';
