-- AAR-844: Cron-Job kanzlei_paket_pending_check
--
-- Triggert täglich 09:30 für Claims wo:
--   - kanzlei_wunsch IN (partnerkanzlei, eigene_kanzlei, nicht_gefragt)
--     (letzteres deckt createClaimForFall-Failure-Edge-Case)
--   - phase IN (4_gutachten_fertig, 5_in_reparatur, 6_kommunikation_versicherung)
--   - KEIN aktives Paket existiert
--   - Mind. 12h seit letzter phase_transition (verhindert Spam wenn Phase grad erreicht)
--   - Noch nicht in den letzten 7 Tagen via notification_event gemeldet (Dedup)
--
-- claims.phase_updated_at existiert nicht → MAX(phase_transitions.transition_at)
-- als Workaround.

CREATE OR REPLACE FUNCTION public.cron_kanzlei_paket_pending_check()
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  IF to_regclass('public.notification_events') IS NULL THEN
    PERFORM public.log_cron_job_run('kanzlei_paket_pending_check', 'success', 0, NULL,
      jsonb_build_object('note', 'notification_events nicht gefunden'));
    RETURN;
  END IF;

  WITH pending_claims AS (
    SELECT
      c.id              AS claim_id,
      c.kanzlei_wunsch,
      c.phase,
      f.id              AS fall_id,
      c.kundenbetreuer_id
      FROM public.claims c
      JOIN public.faelle f ON f.claim_id = c.id
     WHERE c.kanzlei_wunsch IN ('partnerkanzlei','eigene_kanzlei','nicht_gefragt')
       AND c.phase IN ('4_gutachten_fertig','5_in_reparatur','6_kommunikation_versicherung')
       -- KEIN aktives Paket
       AND NOT EXISTS (
         SELECT 1 FROM public.kanzlei_pakete kp
          WHERE kp.claim_id = c.id
            AND kp.status IN ('versendet','bestaetigt')
       )
       -- Mind. 12h seit letzter Phase-Änderung
       AND COALESCE(
             (SELECT MAX(transition_at) FROM public.phase_transitions pt WHERE pt.fall_id = f.id),
             c.created_at
           ) < now() - INTERVAL '12 hours'
       -- Dedup: nicht in den letzten 7 Tagen gemeldet
       AND NOT EXISTS (
         SELECT 1 FROM public.notification_events ne
          WHERE ne.event_type = 'claim.kanzlei_paket_pending'
            AND (ne.payload->>'claim_id')::UUID = c.id
            AND ne.created_at > now() - INTERVAL '7 days'
       )
  )
  INSERT INTO public.notification_events (event_type, payload, fall_id, status)
  SELECT
    'claim.kanzlei_paket_pending',
    jsonb_build_object(
      'claim_id',          pc.claim_id,
      'fall_id',           pc.fall_id,
      'kanzlei_wunsch',    pc.kanzlei_wunsch,
      'phase',             pc.phase,
      'kundenbetreuer_id', pc.kundenbetreuer_id
    ),
    pc.fall_id,
    'pending'
  FROM pending_claims pc;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_cron_job_run('kanzlei_paket_pending_check', 'success', v_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('kanzlei_paket_pending_check', 'error', NULL, SQLERRM);
END $$;

-- Schedule: täglich 09:30
SELECT cron.schedule(
  'kanzlei_paket_pending_check',
  '30 9 * * *',
  $$SELECT public.cron_kanzlei_paket_pending_check()$$
);

COMMENT ON FUNCTION public.cron_kanzlei_paket_pending_check IS
  'AAR-844: KB-Notification für Claims in Phase 4+ mit gewünschter Kanzlei aber '
  'keinem versendeten Paket. Schließt Auto-Paket-Lücke aus AAR-841. Workaround '
  'für fehlendes claims.phase_updated_at: nutzt MAX(phase_transitions.transition_at).';
