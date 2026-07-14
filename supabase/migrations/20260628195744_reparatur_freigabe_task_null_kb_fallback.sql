-- NULL-KB-Absicherung: hat ein werkstatt-Claim keinen Kundenbetreuer, wuerde der Task mit
-- zugewiesen_an/empfaenger_user_id=NULL + rolle='kundenbetreuer' in "Meine Tasks"/TasksPill
-- unsichtbar sein (die filtern auf zugewiesen_an/empfaenger_user_id). Fallback: empfaenger_rolle='admin'
-- -> erscheint prominent auf dem Admin-Task-Board. (Heute 0 Impact: alle werkstatt-Claims haben KB.)
CREATE OR REPLACE FUNCTION public.trg_reparatur_freigabe_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_werkstatt_id uuid; v_kb_id uuid; v_freigegeben timestamptz; v_fall_id uuid; v_rolle text;
BEGIN
  IF NEW.fertiggestellt_am IS NULL OR NEW.claim_id IS NULL THEN RETURN NEW; END IF;
  SELECT c.werkstatt_id, c.kundenbetreuer_id, c.reparatur_freigegeben_am
    INTO v_werkstatt_id, v_kb_id, v_freigegeben FROM public.claims c WHERE c.id = NEW.claim_id;
  IF v_werkstatt_id IS NULL OR v_freigegeben IS NOT NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.tasks WHERE claim_id = NEW.claim_id AND task_code = 'reparatur_freigabe') THEN
    RETURN NEW;
  END IF;
  SELECT b.fall_id INTO v_fall_id FROM public.faelle_claim_bridge b WHERE b.claim_id = NEW.claim_id;
  v_rolle := CASE WHEN v_kb_id IS NULL THEN 'admin' ELSE 'kundenbetreuer' END;
  INSERT INTO public.tasks (
    claim_id, fall_id, typ, task_code, trigger_event, titel, beschreibung,
    status, prioritaet, empfaenger_rolle, empfaenger_user_id, zugewiesen_an, auto_erstellt, faellig_am
  ) VALUES (
    NEW.claim_id, v_fall_id, 'reparatur_freigabe', 'reparatur_freigabe', 'gutachten_fertiggestellt',
    'Reparaturfreigabe für die Werkstatt erteilen',
    'Das Gutachten ist fertig. Bitte die Reparaturfreigabe für die vermittelnde Werkstatt erteilen (Fallakte → Werkstatt-Vermittlung).',
    'offen', 'dringend', v_rolle, v_kb_id, v_kb_id, true, now() + interval '1 day'
  );
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.trg_reparatur_freigabe_task() FROM PUBLIC, anon, authenticated;
