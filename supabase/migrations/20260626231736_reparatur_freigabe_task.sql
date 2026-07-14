-- Auto-Task „Reparaturfreigabe erteilen" fuer den KB bei Gutachten-Fertigstellung
-- (werkstatt-vermittelte Claims) + Auto-Resolve/Re-Open beim Erteilen/Zuruecknehmen.
-- DB-only; Task erscheint in der bestehenden KB-Task-UI (zugewiesen_an/empfaenger_rolle +
-- fall_id via Bridge fuer die Fallakte). Self-contained (keine JS-Task-Engine).

-- (A) Gutachten fertig -> KB-Task (idempotent via task_code+claim_id; nur werkstatt + noch nicht freigegeben)
CREATE OR REPLACE FUNCTION public.trg_reparatur_freigabe_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_werkstatt_id uuid; v_kb_id uuid; v_freigegeben timestamptz; v_fall_id uuid;
BEGIN
  IF NEW.fertiggestellt_am IS NULL OR NEW.claim_id IS NULL THEN RETURN NEW; END IF;
  SELECT c.werkstatt_id, c.kundenbetreuer_id, c.reparatur_freigegeben_am
    INTO v_werkstatt_id, v_kb_id, v_freigegeben FROM public.claims c WHERE c.id = NEW.claim_id;
  IF v_werkstatt_id IS NULL OR v_freigegeben IS NOT NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.tasks WHERE claim_id = NEW.claim_id AND task_code = 'reparatur_freigabe') THEN
    RETURN NEW;
  END IF;
  SELECT b.fall_id INTO v_fall_id FROM public.faelle_claim_bridge b WHERE b.claim_id = NEW.claim_id;
  INSERT INTO public.tasks (
    claim_id, fall_id, typ, task_code, trigger_event, titel, beschreibung,
    status, prioritaet, empfaenger_rolle, empfaenger_user_id, zugewiesen_an, auto_erstellt, faellig_am
  ) VALUES (
    NEW.claim_id, v_fall_id, 'reparatur_freigabe', 'reparatur_freigabe', 'gutachten_fertiggestellt',
    'Reparaturfreigabe für die Werkstatt erteilen',
    'Das Gutachten ist fertig. Bitte die Reparaturfreigabe für die vermittelnde Werkstatt erteilen (Fallakte → Werkstatt-Vermittlung).',
    'offen', 'dringend', 'kundenbetreuer', v_kb_id, v_kb_id, true, now() + interval '1 day'
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_reparatur_freigabe_task ON public.gutachten;
CREATE TRIGGER trg_reparatur_freigabe_task
  AFTER INSERT OR UPDATE OF fertiggestellt_am ON public.gutachten
  FOR EACH ROW EXECUTE FUNCTION public.trg_reparatur_freigabe_task();

-- (B) Auto-Resolve bei Erteilung; Re-Open bei Zuruecknahme (symmetrisch)
CREATE OR REPLACE FUNCTION public.trg_reparatur_freigabe_task_resolve()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.reparatur_freigegeben_am IS NOT NULL AND OLD.reparatur_freigegeben_am IS NULL THEN
    UPDATE public.tasks SET status='erledigt', erledigt_am=now(),
           auto_resolved_am=now(), auto_resolved_grund='reparatur_freigegeben'
     WHERE claim_id=NEW.id AND task_code='reparatur_freigabe' AND status IN ('offen','in-bearbeitung');
  ELSIF NEW.reparatur_freigegeben_am IS NULL AND OLD.reparatur_freigegeben_am IS NOT NULL THEN
    UPDATE public.tasks SET status='offen', erledigt_am=NULL, auto_resolved_am=NULL, auto_resolved_grund=NULL
     WHERE claim_id=NEW.id AND task_code='reparatur_freigabe' AND status='erledigt'
       AND auto_resolved_grund='reparatur_freigegeben';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_reparatur_freigabe_task_resolve ON public.claims;
CREATE TRIGGER trg_reparatur_freigabe_task_resolve
  AFTER UPDATE OF reparatur_freigegeben_am ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.trg_reparatur_freigabe_task_resolve();

-- Trigger-Funktionen nicht direkt callable (Staffelung-Lehre: anon/authenticated default-revoke)
REVOKE ALL ON FUNCTION public.trg_reparatur_freigabe_task() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_reparatur_freigabe_task_resolve() FROM PUBLIC, anon, authenticated;
