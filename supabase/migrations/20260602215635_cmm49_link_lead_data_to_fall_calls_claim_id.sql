-- CMM-49 Live-Fix: link_lead_data_to_fall (Lead->Fall-Konversion, genutzt in
-- flow/[token]/actions.ts + convert-lead-to-fall.ts) machte als ERSTES `UPDATE calls SET fall_id`.
-- calls.fall_id ist seit dem Call-Logs-Drop (20260602213715) weg -> die Fn brach komplett ab
-- (plpgsql ohne inneres Exception-Handling) -> die gesamte Konversions-Verknuepfung (calls/tasks/
-- nachrichten/dokumente) schlug fehl (still, nur geloggt). Fix: calls-Zeile auf claim_id.
-- Rest (tasks/email_log/gutachter_termine/nachrichten/fall_dokumente) bleibt fall_id — diese
-- Spalten existieren noch und werden bei deren jeweiligem fall_id-Drop repointet.
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
  -- CMM-49: calls ist claim-gekeyt (fall_id gedroppt) -> claim_id aus faelle.claim_id des Falls.
  UPDATE calls SET claim_id = (SELECT claim_id FROM faelle WHERE id = p_fall_id), updated_at = now()
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
