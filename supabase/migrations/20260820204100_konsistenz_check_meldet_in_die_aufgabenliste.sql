-- Der Konsistenz-Waechter meldet jetzt in die Admin-Aufgabenliste statt nur nach Slack.
--
-- Warum: `cron_konsistenz_check()` postet seinen Befund an einen Webhook aus
-- `settings.slack_konsistenz_webhook`. Dieser Key EXISTIERT NICHT (20.08.2026 gemessen:
-- 0 Zeilen; in `settings` steht ueberhaupt kein Slack-/Webhook-/Alarm-Eintrag). Der
-- Waechter selbst laeuft einwandfrei — 7 von 7 Tagen, zuletzt 20.08. 08:00 — und findet
-- auch etwas: {"claims_ohne_vehicle": 27, "sv_geocoding_drift_aktiv": 1,
-- "sv_geocoding_drift_inaktiv": 2}. Die Meldung landet nur in `cron_jobs_audit`, wo
-- niemand nachsieht. Ein Alarm, den kein Mensch erreicht, ist kein Alarm.
--
-- Der Slack-Pfad BLEIBT unveraendert: wird der Webhook irgendwann gesetzt, feuert er
-- zusaetzlich. Die Aufgabe ist der verlaessliche Kanal, nicht sein Ersatz.
--
-- Idempotenz ist hier Pflicht, nicht Kuer: der Cron laeuft TAEGLICH. Ein blosses INSERT
-- wuerde die Aufgabenliste fluten — genau so entstand im August die Task-Flut, die an
-- vier Stellen aufgeraeumt werden musste. Solange eine OFFENE Konsistenz-Aufgabe
-- existiert, wird sie aktualisiert; eine zweite entsteht nie.
--
-- Selbstheilend: faellt der Befund weg, schliesst der naechste Lauf die offene Aufgabe
-- mit `auto_resolved_*`. Ein Waechter, dessen Meldung nach der Behebung stehen bleibt,
-- erzieht zum Wegklicken.
--
-- Vorher verifiziert (nichts geraten): task_status-Enum = offen|in-bearbeitung|erledigt|
-- blockiert · tasks-CHECKs nur auf prioritaet (normal|dringend|kritisch) + entity_type ·
-- fall-lose Auto-Tasks mit empfaenger_rolle='admin' sind etabliert (reliability,
-- partner_aktivierung, sv_basic_claim_review) · /admin/aufgaben/alle filtert NICHT nach
-- typ und zeigt damit jede Aufgabe · die Funktion ist SECURITY DEFINER, Owner postgres
-- hat rolbypassrls -> der Insert laeuft trotz RLS auf `tasks`.

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
  v_liste        TEXT;
  v_titel        TEXT;
  v_beschreibung TEXT;
  v_prio         TEXT;
  v_task_id      UUID;
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

    -- 20.08.2026: zweiter, verlaesslicher Kanal — die Admin-Aufgabenliste.
    SELECT string_agg(format('- %s: %s', key, value), chr(10) ORDER BY key)
      INTO v_liste
      FROM jsonb_each_text(v_findings);

    -- "dringend" nur beim SV-Geocoding-Drift AKTIVER Sachverstaendiger: dort entsteht
    -- echter operativer Schaden (falsches Matching im Finder), waehrend die uebrigen
    -- Checks Datenqualitaet melden. Eine Prioritaet, die immer "kritisch" schreit,
    -- wird ignoriert.
    v_prio := CASE WHEN (v_findings ? 'sv_geocoding_drift_aktiv') THEN 'dringend' ELSE 'normal' END;

    v_titel := format('Konsistenz-Prüfung: %s Befund(e)', v_count_total);
    v_beschreibung := format(
      'Der tägliche Konsistenz-Wächter hat Abweichungen gefunden (Stand %s):%s%s%s%s'
      || 'Diese Aufgabe wird bei jedem Lauf aktualisiert, solange sie offen ist — es entsteht '
      || 'keine zweite. Sind die Befunde behoben, schließt der nächste Lauf sie automatisch.%s'
      || 'Rohdaten je Lauf: public.cron_jobs_audit (job_name = ''konsistenz_check'').',
      to_char(now(), 'DD.MM.YYYY HH24:MI'), chr(10), chr(10), v_liste, chr(10) || chr(10), chr(10)
    );

    -- Idempotent: bestehende offene Aufgabe aktualisieren statt eine zweite anzulegen.
    UPDATE public.tasks
       SET titel        = v_titel,
           beschreibung = v_beschreibung,
           prioritaet   = v_prio,
           updated_at   = now()
     WHERE typ = 'konsistenz_check'
       AND status = 'offen'
    RETURNING id INTO v_task_id;

    IF v_task_id IS NULL THEN
      INSERT INTO public.tasks (typ, titel, beschreibung, status, prioritaet,
                                empfaenger_rolle, auto_erstellt)
      VALUES ('konsistenz_check', v_titel, v_beschreibung, 'offen', v_prio,
              'admin', TRUE);
    END IF;

  ELSE
    -- Kein Befund mehr: offene Konsistenz-Aufgabe selbsttaetig schliessen.
    UPDATE public.tasks
       SET status              = 'erledigt',
           erledigt_am         = now(),
           auto_resolved_am    = now(),
           auto_resolved_grund = 'Konsistenz-Prüfung ohne Befund',
           updated_at          = now()
     WHERE typ = 'konsistenz_check'
       AND status = 'offen';
  END IF;

  PERFORM public.log_cron_job_run(
    'konsistenz_check', 'success', v_count_total, NULL, v_findings
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('konsistenz_check', 'error', NULL, SQLERRM);
END
$function$;

COMMENT ON FUNCTION public.cron_konsistenz_check() IS
  'Taeglicher Konsistenz-Waechter (6 Checks). Meldet Befunde in die Admin-Aufgabenliste (typ=konsistenz_check, idempotent, selbstschliessend) und zusaetzlich per Slack, falls settings.slack_konsistenz_webhook gesetzt ist.';