-- cron_gutachten_ocr_recovery: Sichtbarkeit fuer den TATSAECHLICH gepflegten Fehlerpfad.
--
-- Befund 18.08.2026: die Funktion arbeitete ausschliesslich auf gutachten.ocr_status='running'
-- und ocr_runs.status='running'. Beides existiert nie — der OCR-Pfad schreibt diese
-- Statusfamilie ueberhaupt nicht (gemessen: alle gutachten auf 'nicht_gestartet',
-- ocr_runs = 0 Zeilen, ocr_started_at nie gesetzt). Ergebnis: 8.634 Laeufe in 30 Tagen,
-- jeder mit rows_processed=0, jeder als 'success' protokolliert — waehrend die
-- Gutachten-Wert-Extraktion in Wahrheit bei JEDEM Aufruf mit HTTP 400 scheiterte
-- (Structured-Outputs-Limit, Fix in PR #5354).
--
-- Ein Watchdog, der auf Felder schaut, die der ueberwachte Pfad nicht schreibt, meldet
-- Erfolg gerade WEIL er nichts findet. Diese Migration macht den real gepflegten
-- Fehlerpfad (gutachten_ocr_error) im cron_jobs_audit sichtbar.
--
-- BEWUSST KEIN Auto-Retry: bei einem permanenten Fehler (wie dem 400) haette ein blinder
-- Wiederholungsversuch alle 5 Minuten einen teuren Modell-Call auf ein mehrseitiges PDF
-- ausgeloest. Der Schaden war nie "kein Retry", sondern "niemand hat es gemerkt".
--
-- Die bestehende Stuck-Recovery bleibt unveraendert erhalten, damit sie greift, falls die
-- ocr_status/ocr_runs-Familie kuenftig gepflegt wird.

CREATE OR REPLACE FUNCTION public.cron_gutachten_ocr_recovery()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_recovered INT;
  v_fehler_offen INT;
  v_aeltester TIMESTAMPTZ;
  v_letzter TIMESTAMPTZ;
BEGIN
  -- 1) Stuck "running" -> zurueck auf "pending" (unveraendert)
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

  UPDATE public.ocr_runs
     SET status = 'superseded',
         finished_at = now(),
         error_jsonb = jsonb_build_object('reason','stuck_recovery','recovered_at',now())
   WHERE status = 'running'
     AND started_at < now() - INTERVAL '10 minutes';

  -- 2) NEU: den real gepflegten Fehlerpfad zaehlen und melden (keine Mutation).
  SELECT count(*), min(gutachten_ocr_processed_at), max(gutachten_ocr_processed_at)
    INTO v_fehler_offen, v_aeltester, v_letzter
    FROM public.gutachten
   WHERE gutachten_ocr_error IS NOT NULL;

  PERFORM public.log_cron_job_run(
    'gutachten_ocr_recovery',
    'success',
    v_recovered,
    NULL,
    jsonb_build_object(
      'ocr_fehler_offen',      v_fehler_offen,
      'aeltester_fehlversuch', v_aeltester,
      'letzter_fehlversuch',   v_letzter
    )
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('gutachten_ocr_recovery', 'error', NULL, SQLERRM);
END $function$;
