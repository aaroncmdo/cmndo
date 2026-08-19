-- cron_dsgvo_hard_delete: vom toten Stub zum Ueberwacher.
--
-- Befund 18.08.2026: Der Rumpf war an to_regclass('public.dsgvo_delete_requests')
-- gebunden — diese Tabelle existiert nicht, sie heisst dsgvo_loeschauftraege. Der Job
-- uebersprang deshalb lautlos alles und meldete taeglich 'success'.
--
-- Ein reiner Namenstausch waere FALSCH gewesen: das UPDATE setzt Spalten auf
-- claim_parties (vorname/nachname/email/telefon/adresse_*/geburtsdatum), die es dort
-- gar nicht mehr gibt — die Personendaten sind nach persons normalisiert
-- (claim_parties traegt nur noch person_id/firma_id). Der Job waere von "tut nichts"
-- auf "wirft Fehler" gewechselt.
--
-- Die Anonymisierung selbst laeuft vollstaendig ueber den Admin-Pfad
-- (src/lib/actions/dsgvo-loeschung.ts -> rpc dsgvo_anonymize_user_data, das persons
-- und leads anfasst, danach auth.users-Delete + status='ausgefuehrt'). Diese Logik
-- hier zu duplizieren hiesse, zwei parallele Loeschpfade fuer DSGVO-Daten zu pflegen —
-- bei irreversiblen Aktionen ein Divergenzrisiko.
--
-- Der Job ueberwacht daher nur noch den SOLL-Zustand: "kein bestaetigter Loeschauftrag
-- bleibt ueber die 30-Tage-Karenz hinaus unausgefuehrt liegen". Er mutiert nichts.
-- Trockentest vor dem Umbau: 0 faellige Auftraege, 0 betroffene claim_parties (von 80).

CREATE OR REPLACE FUNCTION public.cron_dsgvo_hard_delete()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ueberfaellig INT := 0;
  v_aeltester    TIMESTAMPTZ;
  v_offen_gesamt INT := 0;
BEGIN
  -- Bestaetigte Auftraege, deren 30-Tage-Karenz abgelaufen ist und die noch
  -- niemand ausgefuehrt hat. Das ist der Zustand, der NICHT vorkommen darf.
  SELECT count(*), min(bestaetigt_am)
    INTO v_ueberfaellig, v_aeltester
    FROM public.dsgvo_loeschauftraege
   WHERE status = 'bestaetigt'
     AND bestaetigt_am < now() - INTERVAL '30 days'
     AND ausgefuehrt_am IS NULL;

  -- Zusaetzlich: alles, was ueberhaupt noch offen ist (eingereicht/bestaetigt).
  SELECT count(*)
    INTO v_offen_gesamt
    FROM public.dsgvo_loeschauftraege
   WHERE status IN ('eingereicht','bestaetigt')
     AND ausgefuehrt_am IS NULL;

  PERFORM public.log_cron_job_run(
    'dsgvo_hard_delete',
    'success',
    v_ueberfaellig,
    NULL,
    jsonb_build_object(
      'ueberfaellig_ueber_30d', v_ueberfaellig,
      'aeltester_bestaetigt_am', v_aeltester,
      'offene_auftraege_gesamt', v_offen_gesamt,
      'hinweis', 'nur Ueberwachung — die Anonymisierung laeuft ueber den Admin-Pfad (rpc dsgvo_anonymize_user_data)'
    )
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('dsgvo_hard_delete', 'error', NULL, SQLERRM);
END $function$;
