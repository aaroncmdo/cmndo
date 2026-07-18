-- Eskalation ueberfaelliger Reparaturfreigabe-Tasks. Self-contained (nur mitteilungen-Insert,
-- KEINE externe I/O) -> wie die 19 bestehenden pg_cron-Jobs, zuverlaessig in-DB.
-- Stage 1: erstmals ueberfaellig -> Nudge an den KB + eskaliert_am setzen.
-- Stage 2: weiter offen >2 Tage nach Eskalation -> Nudge an alle Admins (max alle 2 Tage je Fall).
CREATE OR REPLACE FUNCTION public.cron_reparatur_freigabe_eskalation()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_stage1 int := 0; v_stage2 int := 0;
BEGIN
  -- STAGE 1a: KB-Nudge wo ein Assignee existiert
  INSERT INTO public.mitteilungen (empfaenger_id, empfaenger_rolle, kategorie, titel, inhalt, kontext_typ, kontext_id, route_url, icon, prioritaet)
  SELECT t.zugewiesen_an, COALESCE(t.empfaenger_rolle,'kundenbetreuer'), 'task',
         'Reparaturfreigabe überfällig',
         'Die Reparaturfreigabe für eine vermittelnde Werkstatt ist seit gestern offen. Bitte zeitnah in der Fallakte erteilen.',
         'claim', t.claim_id, '/faelle/' || COALESCE(t.fall_id::text, t.claim_id::text), '🔧', 'dringend'
  FROM public.tasks t
  WHERE t.task_code='reparatur_freigabe' AND t.status='offen' AND t.faellig_am < now()
    AND t.eskaliert_am IS NULL AND t.zugewiesen_an IS NOT NULL;

  -- STAGE 1b: eskaliert_am fuer ALLE erstmals ueberfaelligen markieren (auch ohne Assignee)
  UPDATE public.tasks t SET eskaliert_am = now()
  WHERE t.task_code='reparatur_freigabe' AND t.status='offen' AND t.faellig_am < now()
    AND t.eskaliert_am IS NULL;
  GET DIAGNOSTICS v_stage1 = ROW_COUNT;

  -- STAGE 2: weiter offen >2 Tage nach erster Eskalation -> Admin-Nudge (Guard: max alle 2 Tage je Fall)
  INSERT INTO public.mitteilungen (empfaenger_id, empfaenger_rolle, kategorie, titel, inhalt, kontext_typ, kontext_id, route_url, icon, prioritaet)
  SELECT p.id, 'admin', 'task',
         'Reparaturfreigabe weiter offen',
         'Eine Reparaturfreigabe ist seit über zwei Tagen überfällig und noch nicht erteilt. Bitte beim zuständigen Kundenbetreuer nachhaken.',
         'claim', t.claim_id, '/faelle/' || COALESCE(t.fall_id::text, t.claim_id::text), '⚠️', 'dringend'
  FROM public.tasks t
  CROSS JOIN public.profiles p
  WHERE t.task_code='reparatur_freigabe' AND t.status='offen'
    AND t.eskaliert_am IS NOT NULL AND t.eskaliert_am < now() - interval '2 days'
    AND p.rolle = 'admin'
    AND NOT EXISTS (
      SELECT 1 FROM public.mitteilungen m
      WHERE m.kontext_id = t.claim_id AND m.titel = 'Reparaturfreigabe weiter offen'
        AND m.created_at > now() - interval '2 days'
    );
  GET DIAGNOSTICS v_stage2 = ROW_COUNT;

  PERFORM public.log_cron_job_run('reparatur_freigabe_eskalation', 'success', v_stage1 + v_stage2,
    NULL, jsonb_build_object('stage1', v_stage1, 'stage2_admin_nudges', v_stage2));
EXCEPTION WHEN others THEN
  PERFORM public.log_cron_job_run('reparatur_freigabe_eskalation', 'error', NULL, sqlerrm);
END $$;

REVOKE ALL ON FUNCTION public.cron_reparatur_freigabe_eskalation() FROM PUBLIC, anon, authenticated;

-- Replay-Toleranz (Preview-Chain-Fix 17.07.): pg_cron ist cluster-weit nur auf Prod/Staging
-- installiert, NICHT in Supabase-Preview-Branches/From-Scratch-Replays -> Schema "cron" fehlt dort
-- -> ungeguardetes cron.schedule bricht den Replay (SQLSTATE 3F000). Guard-Muster wie
-- 20260529212846_schedule_connection_snapshot_cron. Auf Prod (cron vorhanden) 1:1 unveraendert.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.schedule('reparatur_freigabe_eskalation', '0 9 * * *', $cron$SELECT public.cron_reparatur_freigabe_eskalation()$cron$);
  ELSE
    RAISE NOTICE 'pg_cron nicht installiert - Cron-Job reparatur_freigabe_eskalation uebersprungen (Preview/lokal)';
  END IF;
END $$;
