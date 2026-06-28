-- ============================================================================
-- Smoke-Test: Werkstatt-Reparaturfreigabe (Trigger + Follow-ups)
-- ============================================================================
-- Deckt ab:
--   (1) Gutachten fertig -> KB-Task entsteht        (trg_reparatur_freigabe_task)
--   (2) Idempotenz: kein Duplikat
--   (3) Freigabe erteilt -> Task erledigt           (trg_reparatur_freigabe_task_resolve)
--   (4) Freigabe zurueckgenommen -> Task wieder offen
--   (5) NULL-KB -> Task an empfaenger_rolle='admin' (NULL-KB-Fallback)
--   (6) Eskalations-Cron -> KB-Nudge bei ueberfaelligem Task (cron_reparatur_freigabe_eskalation)
--   (7) Nicht-werkstatt-Claim -> KEIN Task
--   (8) Status-RPC -> 'freigabe_ausstehend' bei fertigem, nicht-freigegebenem Gutachten
--
-- TRANSAKTIONAL: das abschliessende RAISE EXCEPTION rollt ALLES zurueck -> nichts wird
-- persistiert. Findet Test-Claims dynamisch (keine hardcoded IDs) -> wiederholbar.
--
-- Ausfuehren:
--   - via Supabase-Plugin: execute_sql mit diesem Inhalt (Wirkung = read-only durch Rollback)
--   - via psql:           psql "$DATABASE_URL" -f supabase/smoke/reparatur_freigabe.sql
--
-- Erwartetes RAISE-Ergebnis:
--   created=1 dup=1 resolved=1 reopened=1 nullkb_rolle=admin nudge=1 nonwerk=0 status=freigabe_ausstehend
-- ============================================================================
DO $$
DECLARE
  v_sv uuid; v_kb uuid; v_fall uuid; v_gut uuid;
  v_werk1 uuid;        -- werkstatt-Claim #1 (Lifecycle + Eskalation + Status)
  v_werk2 uuid;        -- werkstatt-Claim #2 (NULL-KB-Fallback)
  v_nonwerk uuid;      -- Nicht-werkstatt-Claim
  v_werk_user uuid;    -- user_id der Werkstatt von #1 (fuer RPC-Impersonation)
  c_created int; c_dup int; c_resolved int; c_reopened int; c_nonwerk int; v_nudge int;
  v_nullkb_rolle text; v_status text;
BEGIN
  SELECT sv_id INTO v_sv FROM public.gutachten WHERE sv_id IS NOT NULL LIMIT 1;
  SELECT c.id, c.kundenbetreuer_id INTO v_werk1, v_kb FROM public.claims c
   WHERE c.werkstatt_id IS NOT NULL AND c.kundenbetreuer_id IS NOT NULL
     AND c.reparatur_freigegeben_am IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.gutachten g WHERE g.claim_id=c.id) LIMIT 1;
  SELECT c.id INTO v_werk2 FROM public.claims c
   WHERE c.werkstatt_id IS NOT NULL AND c.id <> v_werk1
     AND NOT EXISTS (SELECT 1 FROM public.gutachten g WHERE g.claim_id=c.id) LIMIT 1;
  SELECT c.id INTO v_nonwerk FROM public.claims c
   WHERE c.werkstatt_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.gutachten g WHERE g.claim_id=c.id) LIMIT 1;
  SELECT w.user_id INTO v_werk_user FROM public.werkstaetten w
   JOIN public.claims c ON c.werkstatt_id=w.id WHERE c.id=v_werk1;
  IF v_sv IS NULL OR v_werk1 IS NULL OR v_werk2 IS NULL OR v_nonwerk IS NULL THEN
    RAISE EXCEPTION 'SMOKE-SETUP unvollstaendig: sv=% werk1=% werk2=% nonwerk=%', v_sv, v_werk1, v_werk2, v_nonwerk;
  END IF;

  -- (1) Gutachten fertig -> Task
  INSERT INTO public.gutachten (claim_id, sv_id, status, fertiggestellt_am)
  VALUES (v_werk1, v_sv, 'final', now()) RETURNING id INTO v_gut;
  SELECT count(*) INTO c_created FROM public.tasks WHERE claim_id=v_werk1 AND task_code='reparatur_freigabe';
  -- (2) Idempotenz
  UPDATE public.gutachten SET fertiggestellt_am=now() WHERE id=v_gut;
  SELECT count(*) INTO c_dup FROM public.tasks WHERE claim_id=v_werk1 AND task_code='reparatur_freigabe';
  -- (3) Freigabe -> erledigt
  UPDATE public.claims SET reparatur_freigegeben_am=now() WHERE id=v_werk1;
  SELECT count(*) INTO c_resolved FROM public.tasks WHERE claim_id=v_werk1 AND task_code='reparatur_freigabe' AND status='erledigt';
  -- (4) Zuruecknahme -> wieder offen
  UPDATE public.claims SET reparatur_freigegeben_am=NULL WHERE id=v_werk1;
  SELECT count(*) INTO c_reopened FROM public.tasks WHERE claim_id=v_werk1 AND task_code='reparatur_freigabe' AND status='offen';

  -- (5) NULL-KB -> Task an Admin-Rolle
  UPDATE public.claims SET kundenbetreuer_id=NULL WHERE id=v_werk2;
  INSERT INTO public.gutachten (claim_id, sv_id, status, fertiggestellt_am) VALUES (v_werk2, v_sv, 'final', now());
  SELECT empfaenger_rolle INTO v_nullkb_rolle FROM public.tasks WHERE claim_id=v_werk2 AND task_code='reparatur_freigabe';

  -- (6) Eskalation: Task von #1 ueberfaellig machen -> Cron nudged den KB
  UPDATE public.tasks SET faellig_am=now() - interval '2 days', eskaliert_am=NULL, status='offen'
   WHERE claim_id=v_werk1 AND task_code='reparatur_freigabe';
  PERFORM public.cron_reparatur_freigabe_eskalation();
  SELECT count(*) INTO v_nudge FROM public.mitteilungen
   WHERE kontext_id=v_werk1 AND titel='Reparaturfreigabe überfällig';

  -- (7) Nicht-werkstatt -> KEIN Task
  INSERT INTO public.gutachten (claim_id, sv_id, status, fertiggestellt_am) VALUES (v_nonwerk, v_sv, 'final', now());
  SELECT count(*) INTO c_nonwerk FROM public.tasks WHERE claim_id=v_nonwerk AND task_code='reparatur_freigabe';

  -- (8) Status-RPC -> 'freigabe_ausstehend' (Gutachten #1 fertig, nicht freigegeben) via Impersonation
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_werk_user)::text, true);
  SELECT status INTO v_status FROM public.get_werkstatt_vermittlungen() WHERE claim_id=v_werk1;

  RAISE EXCEPTION 'SMOKE created=% dup=% resolved=% reopened=% nullkb_rolle=% nudge=% nonwerk=% status=% (exp 1/1/1/1/admin/1/0/freigabe_ausstehend)',
    c_created, c_dup, c_resolved, c_reopened, v_nullkb_rolle, v_nudge, c_nonwerk, v_status;
END $$;
