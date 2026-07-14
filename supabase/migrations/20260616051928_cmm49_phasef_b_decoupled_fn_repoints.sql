-- CMM-49 Phase F (Batch B): entkoppelte Funktions-Repoints faelle -> faelle_claim_bridge
-- + Drop einer verwaisten faelle-Schreiber-Funktion. Alle value-neutral (bridge.fall_id ==
-- faelle.id 1:1, 0 divergent, keine FKs -> ueberlebt DROP TABLE faelle).

-- C1: link_lead_data_to_fall — der EINZIGE faelle-Table-Read (calls.claim_id-Lookup) -> Bridge.
--     Die uebrigen UPDATEs setzen fall_id-SPALTEN auf anderen Tabellen (tasks/gutachter_termine/
--     nachrichten/fall_dokumente/email_log) — die ueberleben den faelle-DROP (kein FK).
CREATE OR REPLACE FUNCTION public.link_lead_data_to_fall(p_lead_id uuid, p_fall_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  cnt_calls INTEGER := 0;
  cnt_tasks INTEGER := 0;
  cnt_emails INTEGER := 0;
  cnt_termine INTEGER := 0;
  cnt_nachrichten INTEGER := 0;
  cnt_nachrichten_prov INTEGER := 0;
  cnt_dokumente INTEGER := 0;
BEGIN
  -- CMM-49 Phase F: calls ist claim-gekeyt -> claim_id aus der Bridge (fall_id->claim_id), nicht mehr faelle.
  UPDATE calls SET claim_id = (SELECT claim_id FROM public.faelle_claim_bridge WHERE fall_id = p_fall_id), updated_at = now()
    WHERE lead_id = p_lead_id AND claim_id IS NULL;
  GET DIAGNOSTICS cnt_calls = ROW_COUNT;

  UPDATE tasks SET fall_id = p_fall_id
    WHERE lead_id = p_lead_id AND fall_id IS NULL;
  GET DIAGNOSTICS cnt_tasks = ROW_COUNT;

  UPDATE email_log SET lead_id = p_lead_id
    WHERE fall_id = p_fall_id AND lead_id IS NULL;
  GET DIAGNOSTICS cnt_emails = ROW_COUNT;

  UPDATE gutachter_termine SET fall_id = p_fall_id
    WHERE lead_id = p_lead_id AND fall_id IS NULL;
  GET DIAGNOSTICS cnt_termine = ROW_COUNT;

  UPDATE nachrichten SET fall_id = p_fall_id
    WHERE lead_id = p_lead_id AND fall_id IS NULL;
  GET DIAGNOSTICS cnt_nachrichten = ROW_COUNT;

  UPDATE nachrichten SET lead_id = p_lead_id
    WHERE fall_id = p_fall_id AND lead_id IS NULL;
  GET DIAGNOSTICS cnt_nachrichten_prov = ROW_COUNT;

  UPDATE fall_dokumente SET lead_id = p_lead_id
    WHERE fall_id = p_fall_id AND lead_id IS NULL;
  GET DIAGNOSTICS cnt_dokumente = ROW_COUNT;

  RETURN jsonb_build_object(
    'calls', cnt_calls,
    'tasks', cnt_tasks,
    'emails', cnt_emails,
    'termine', cnt_termine,
    'nachrichten', cnt_nachrichten + cnt_nachrichten_prov,
    'dokumente', cnt_dokumente
  );
END;
$function$;

-- C2: trg_fall_dokumente_autotask — der EINZIGE faelle-Table-Read (kundenbetreuer-Lookup) -> Bridge JOIN claims.
CREATE OR REPLACE FUNCTION public.trg_fall_dokumente_autotask()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kb_id UUID;
  v_slot_label TEXT;
  v_doc_desc TEXT;
BEGIN
  IF NEW.uploaded_by_kunde IS NOT TRUE THEN RETURN NEW; END IF;

  -- CMM-49 Phase F: kundenbetreuer-Lookup via Bridge (fall_id->claim_id) JOIN claims, nicht mehr faelle.
  SELECT c.kundenbetreuer_id INTO v_kb_id
  FROM public.faelle_claim_bridge b
  JOIN public.claims c ON c.id = b.claim_id
  WHERE b.fall_id = NEW.fall_id;

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
$function$;

-- B1: trg_fn_sync_kanzlei_paket_to_faelle — verwaiste tote Funktion (KEIN Trigger nutzt sie;
--     faelle.aktuelle_phase wird ueber diesen Pfad laengst nicht mehr geschrieben). Schreibt die
--     faelle-Tabelle -> DROP. (Ohne CASCADE: Postgres blockt den DROP, falls doch ein Trigger haengt.)
DROP FUNCTION IF EXISTS public.trg_fn_sync_kanzlei_paket_to_faelle();
