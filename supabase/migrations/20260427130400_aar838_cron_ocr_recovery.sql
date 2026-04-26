-- AAR-838: Cron-Recovery für stuck OCR-Runs.
--
-- Findet alle 5 Min Gutachten mit ocr_status='running' deren ocr_started_at
-- älter als 10 Min ist (Worker hängt oder ist gecrasht). Setzt ocr_status
-- zurück auf 'pending' damit der nächste Edge-Function-Trigger neu starten
-- kann. ocr_runs-Row wird auf 'superseded' gesetzt.
--
-- Plus: triggert Edge Function für 'pending'-Rows die älter als 2 Min sind
-- (Auto-Retry-Sicherung falls Upload-Action fire-and-forget gescheitert war).

CREATE OR REPLACE FUNCTION public.cron_gutachten_ocr_recovery()
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_recovered INT;
BEGIN
  -- 1) Stuck "running" → zurück auf "pending"
  WITH stuck AS (
    SELECT id, ocr_run_id
      FROM public.gutachten
     WHERE ocr_status = 'running'
       AND ocr_started_at < now() - INTERVAL '10 minutes'
  )
  UPDATE public.gutachten g
     SET ocr_status = 'pending'
    FROM stuck
   WHERE g.id = stuck.id;

  GET DIAGNOSTICS v_recovered = ROW_COUNT;

  -- Stuck ocr_runs auf 'superseded' setzen damit klar ist dass sie obsolet sind
  UPDATE public.ocr_runs
     SET status = 'superseded',
         finished_at = now(),
         error_jsonb = jsonb_build_object('reason','stuck_recovery','recovered_at',now())
   WHERE status = 'running'
     AND started_at < now() - INTERVAL '10 minutes';

  PERFORM public.log_cron_job_run('gutachten_ocr_recovery', 'success', v_recovered);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('gutachten_ocr_recovery', 'error', NULL, SQLERRM);
END $$;

SELECT cron.schedule(
  'gutachten_ocr_recovery',
  '*/5 * * * *',
  $$SELECT public.cron_gutachten_ocr_recovery()$$
);

COMMENT ON FUNCTION public.cron_gutachten_ocr_recovery IS
  'AAR-838: Recovery-Job alle 5 Min. Stuck running→pending nach 10 Min. '
  'Edge Function trigger für pending-Rows ist fire-and-forget aus Server-Action — '
  'Recovery hier setzt nur Status zurück, Edge-Trigger passiert via separater Logik.';
