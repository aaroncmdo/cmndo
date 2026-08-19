-- Check 2 des Konsistenz-Crons zaehlte die als Testfall DEAKTIVIERTEN Claims mit.
-- Messung 19.08.: von 53 gemeldeten tragen 26 `ist_aktiv=false` mit
-- `deaktiviert_grund='testfall'` (Smokes deaktivieren ihre Claims, statt sie hart zu
-- loeschen), weitere 6 einen SMOKE-Marker im Schadenort. Der Wert stand deshalb
-- wochenlang konstant auf 53 = 70 % aller Claims und war als Alarm wertlos — die
-- wenigen echten Faelle ertranken im Rauschen.
--
-- Geaendert ist AUSSCHLIESSLICH Check 2 (ist_aktiv IS NOT FALSE). Alle uebrigen Checks
-- inkl. des am 19.08. ergaenzten Check 7 (sv_geocoding_drift, #5407) sind unveraendert
-- aus der laufenden Definition uebernommen.
--
-- Bewusst NICHT gefiltert: der SMOKE-Marker im Freitextfeld `schadenort_adresse`.
-- `ist_aktiv` ist das strukturierte Kriterium; eine String-Heuristik im DB-Check waere
-- fragil. Erwartete Meldung danach: 27 statt 53.
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
  v_count_inakt  INT;
  v_slack_url    TEXT;
  v_response_id  BIGINT;
BEGIN
  -- CMM-49 Phase F: Check "faelle ohne claim_id" entfernt — faelle ist eingefroren, claim_id ist
  -- NOT NULL-backfilled + bridge erzwingt 1:1 (Wert war konstant 0); die Tabelle stirbt im DROP.

  -- Check 2: claims ohne vehicle_id (nur AKTIVE — deaktivierte sind Testfaelle, s. Kopf)
  SELECT count(*) INTO v_count
    FROM public.claims
   WHERE vehicle_id IS NULL
     AND ist_aktiv IS NOT FALSE;
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

  -- Check 7 (19.08.): SV-Koordinaten weichen > 25 km von ihrer eigenen PLZ ab.
  -- Haversine gegen plz_geo; least/greatest klemmt Rundungsfehler vor acos ab.
  WITH drift AS (
    SELECT s.ist_aktiv,
           6371 * acos(least(1, greatest(-1,
             sin(radians(g.lat::float8)) * sin(radians(s.standort_lat::float8)) +
             cos(radians(g.lat::float8)) * cos(radians(s.standort_lat::float8)) *
             cos(radians(s.standort_lng::float8) - radians(g.lng::float8))
           ))) AS km
      FROM public.sachverstaendige s
      JOIN public.plz_geo g ON g.plz = s.standort_plz
     WHERE s.standort_lat IS NOT NULL
       AND s.standort_lng IS NOT NULL
  )
  SELECT count(*) FILTER (WHERE ist_aktiv IS TRUE),
         count(*) FILTER (WHERE ist_aktiv IS NOT TRUE)
    INTO v_count, v_count_inakt
    FROM drift
   WHERE km > 25;

  IF v_count > 0 THEN
    v_findings    := v_findings || jsonb_build_object('sv_geocoding_drift_aktiv', v_count);
    v_count_total := v_count_total + v_count;
  END IF;
  IF v_count_inakt > 0 THEN
    -- reine Information: zaehlt NICHT in v_count_total, damit der Alarm nicht lauter
    -- wird als der operative Schaden (inaktive SVs nehmen nicht am Matching teil).
    v_findings := v_findings || jsonb_build_object('sv_geocoding_drift_inaktiv', v_count_inakt);
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
