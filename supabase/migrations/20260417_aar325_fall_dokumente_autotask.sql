-- AAR-325 (Child 5 von AAR-320): Auto-Task bei Kunden-Upload.
-- AFTER INSERT Trigger auf fall_dokumente erzeugt einen KB-Task pro Upload:
--  1. dokument-pruefen (immer bei uploaded_by_kunde=true) — Qualitätskontrolle
--  2. dokument-zuordnen (wenn dokument_typ unklar: 'kunde-nachreichung',
--     'sonstiges', NULL) — KB muss Slot zuweisen
--
-- Empfänger ist faelle.kundenbetreuer_id, Fallback: erster Admin.
-- Dedup per entity_type+entity_id+task_typ, damit Replay-Inserts keine
-- Task-Duplikate erzeugen.
--
-- Applied via Supabase MCP apply_migration am 2026-04-17. Kanonische Kopie
-- für git-History.

CREATE OR REPLACE FUNCTION public.trg_fall_dokumente_autotask()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_kb_id UUID;
  v_slot_label TEXT;
  v_doc_desc TEXT;
BEGIN
  -- Nur für echte Kunden-Uploads feuern
  IF NEW.uploaded_by_kunde IS NOT TRUE THEN RETURN NEW; END IF;

  -- KB des Falls bestimmen
  SELECT kundenbetreuer_id INTO v_kb_id
  FROM public.faelle WHERE id = NEW.fall_id;

  IF v_kb_id IS NULL THEN
    SELECT id INTO v_kb_id FROM public.profiles WHERE rolle = 'admin' LIMIT 1;
  END IF;
  IF v_kb_id IS NULL THEN RETURN NEW; END IF;

  -- Human-readable Slot-Label (aus Katalog, Fallback: original_filename)
  SELECT label INTO v_slot_label
  FROM public.dokument_katalog WHERE slot_id = NEW.dokument_typ;
  IF v_slot_label IS NULL THEN
    v_slot_label := COALESCE(NEW.original_filename, NEW.dokument_typ, 'Dokument');
  END IF;
  v_doc_desc := COALESCE(NEW.original_filename, v_slot_label);

  -- 1. dokument-pruefen (immer)
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

  -- 2. dokument-zuordnen (nur bei unklarem Slot)
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

DROP TRIGGER IF EXISTS fall_dokumente_autotask ON public.fall_dokumente;
CREATE TRIGGER fall_dokumente_autotask
  AFTER INSERT ON public.fall_dokumente
  FOR EACH ROW EXECUTE FUNCTION public.trg_fall_dokumente_autotask();

COMMENT ON FUNCTION public.trg_fall_dokumente_autotask IS
  'AAR-325 (Child 5 von AAR-320): Erzeugt bei Kunden-Upload automatisch einen KB-Task zum Prüfen (und ggf. Zuordnen, bei unklaren Slots).';
