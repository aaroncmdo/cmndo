-- AAR-325 Audit-Fix: Härtung des Auto-Task-Triggers.
--  1. SET search_path = public, pg_temp innerhalb der SECURITY-DEFINER-Funktion
--     (Schema-Hijacking-Schutz durch nachgelagerte Rollen mit Schreibrecht
--     auf public/andere Schemas).
--  2. Index tasks(entity_type, entity_id) für die NOT-EXISTS-Dedup-Query.
--
-- Applied via Supabase MCP apply_migration am 2026-04-17.

CREATE OR REPLACE FUNCTION public.trg_fall_dokumente_autotask()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kb_id UUID;
  v_slot_label TEXT;
  v_doc_desc TEXT;
BEGIN
  IF NEW.uploaded_by_kunde IS NOT TRUE THEN RETURN NEW; END IF;

  SELECT kundenbetreuer_id INTO v_kb_id
  FROM public.faelle WHERE id = NEW.fall_id;

  IF v_kb_id IS NULL THEN
    SELECT id INTO v_kb_id FROM public.profiles WHERE rolle = 'admin' LIMIT 1;
  END IF;
  IF v_kb_id IS NULL THEN RETURN NEW; END IF;

  SELECT label INTO v_slot_label
  FROM public.dokument_katalog WHERE slot_id = NEW.dokument_typ;
  IF v_slot_label IS NULL THEN
    v_slot_label := COALESCE(NEW.original_filename, NEW.dokument_typ, 'Dokument');
  END IF;
  v_doc_desc := COALESCE(NEW.original_filename, v_slot_label);

  INSERT INTO public.tasks (
    fall_id, empfaenger_user_id, empfaenger_rolle,
    typ, task_typ, titel, status, prioritaet,
    entity_type, entity_id, auto_erstellt
  )
  SELECT
    NEW.fall_id, v_kb_id, 'kundenbetreuer',
    'dokument-pruefen', 'dokument-pruefen',
    'Dokument prüfen: ' || v_slot_label,
    'offen'::task_status, 'normal',
    'fall_dokumente', NEW.id, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE fall_id = NEW.fall_id
      AND entity_type = 'fall_dokumente'
      AND entity_id = NEW.id
      AND task_typ = 'dokument-pruefen'
      AND status IN ('offen', 'in-bearbeitung')
  );

  IF NEW.dokument_typ IN ('kunde-nachreichung', 'sonstiges') OR NEW.dokument_typ IS NULL THEN
    INSERT INTO public.tasks (
      fall_id, empfaenger_user_id, empfaenger_rolle,
      typ, task_typ, titel, status, prioritaet,
      entity_type, entity_id, auto_erstellt
    )
    SELECT
      NEW.fall_id, v_kb_id, 'kundenbetreuer',
      'dokument-zuordnen', 'dokument-zuordnen',
      'Dokument zuordnen: ' || v_doc_desc,
      'offen'::task_status, 'dringend',
      'fall_dokumente', NEW.id, true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tasks
      WHERE fall_id = NEW.fall_id
        AND entity_type = 'fall_dokumente'
        AND entity_id = NEW.id
        AND task_typ = 'dokument-zuordnen'
        AND status IN ('offen', 'in-bearbeitung')
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_tasks_entity
  ON public.tasks(entity_type, entity_id)
  WHERE entity_type IS NOT NULL;
