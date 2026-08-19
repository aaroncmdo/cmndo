-- cron_gutachten_ocr_recovery: prueft den SOLL-Zustand statt eines Prozess-Zustands.
--
-- Vorgeschichte: Die Funktion arbeitete urspruenglich nur auf
-- gutachten.ocr_status='running' / ocr_runs.status='running'. Beides wird vom
-- Produktivpfad nie geschrieben — 8.634 Laeufe in 30 Tagen meldeten 'success' mit
-- rows_processed=0, waehrend die Extraktion in Wahrheit bei jedem Aufruf mit HTTP 400
-- scheiterte (Schema-Limit, PR #5354). Der 1. Nachbesserungsschritt ergaenzte die Zahl
-- der Gutachten mit gutachten_ocr_error.
--
-- Dieser Schritt schliesst die verbleibende Luecke. Ein PROZESS-Zustand ("laeuft
-- gerade einer?") luegt genau dann, wenn man ihn braucht: stirbt der Node-Prozess
-- mitten im fire-and-forget-Aufruf aus gutachtenAbgeben (qc.ts) — und deployt wird
-- mehrmals taeglich —, wird WEDER 'running' NOCH ein Fehler je geschrieben. Das
-- Gutachten sieht danach aus wie "nie versucht" und faellt durch jedes Prozess-Raster.
--
-- Geprueft wird deshalb der ERGEBNIS-Zustand:
--   "Jedes abgegebene Gutachten (auftraege.gutachten_url gesetzt) hat nach einer
--    Karenz von 15 Minuten ein OCR-Ergebnis."
-- Das erfasst Prozess-Tod, nie ausgeloestes fire-and-forget und verlorene Calls
-- gleichermassen — ohne eine zweite Statusfamilie zu pflegen.
--
-- Bewusst getrennt gemeldet, weil die Faelle unterschiedliche Antworten brauchen:
--   * ocr_nie_verarbeitet -> nie versucht, ein Retry waere sinnvoll (Prozess-Tod)
--   * ocr_fehlgeschlagen  -> versucht und dauerhaft gescheitert, ein Retry waere nur teuer
--
-- WEITERHIN KEIN Auto-Retry: erst messen, ob der Fall real vorkommt. Bei einem
-- permanenten Fehler haette blindes Wiederholen alle 5 Minuten einen teuren
-- Modell-Call auf ein mehrseitiges PDF ausgeloest.
--
-- Teil 1 (Stuck-Recovery) bleibt unveraendert erhalten — er greift, falls die
-- ocr_status/ocr_runs-Familie kuenftig doch gepflegt wird.

CREATE OR REPLACE FUNCTION public.cron_gutachten_ocr_recovery()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_recovered      INT;
  v_fehler_offen   INT;
  v_nie_verarbeitet INT;
  v_abgegeben      INT;
  v_aeltester      TIMESTAMPTZ;
BEGIN
  -- 1) Stuck "running" -> zurueck auf "pending" (unveraendert; greift nur, falls die
  --    ocr_status-Familie je gepflegt wird)
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

  -- 2) SOLL-Zustand: jedes abgegebene Gutachten hat ein OCR-Ergebnis.
  SELECT
    count(*),
    count(*) FILTER (WHERE g.gutachten_ocr_processed_at IS NULL),
    count(*) FILTER (WHERE g.gutachten_ocr_error IS NOT NULL),
    min(g.created_at) FILTER (WHERE g.gutachten_ocr_processed_at IS NULL)
    INTO v_abgegeben, v_nie_verarbeitet, v_fehler_offen, v_aeltester
    FROM public.gutachten g
    JOIN public.auftraege a ON a.claim_id = g.claim_id
   WHERE a.gutachten_url IS NOT NULL
     AND g.created_at < now() - INTERVAL '15 minutes';

  PERFORM public.log_cron_job_run(
    'gutachten_ocr_recovery',
    'success',
    v_recovered,
    NULL,
    jsonb_build_object(
      'abgegebene_gutachten',   v_abgegeben,
      'ocr_nie_verarbeitet',    v_nie_verarbeitet,
      'ocr_fehlgeschlagen',     v_fehler_offen,
      'aeltester_unverarbeitet', v_aeltester
    )
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('gutachten_ocr_recovery', 'error', NULL, SQLERRM);
END $function$;
