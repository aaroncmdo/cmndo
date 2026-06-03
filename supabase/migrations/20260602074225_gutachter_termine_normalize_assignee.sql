-- P2.2: assignee_* aus Legacy-Spalten (sv_id/sv_lead_id/kb_id) ableiten, WENN assignee_id NULL.
-- Macht den assignee-gekeyten Exclusion-Constraint (naechste Migration) non-regressiv: kein
-- heutiger Writer setzt assignee_id, also wuerde der Constraint ohne diesen Trigger neue
-- Buchungen ungeschuetzt lassen. Sortiert per Name vor trg_gutachter_termine_validate_assignee
-- ('n' < 'v') → der Bestands-Validierungstrigger sieht das populierte assignee. kanzlei hat
-- keine Legacy-Spalte → wird direkt geschrieben (Phase 3+), daher hier nicht abgedeckt.
CREATE OR REPLACE FUNCTION public.gutachter_termine_normalize_assignee()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.assignee_id IS NULL THEN
    IF NEW.sv_id IS NOT NULL THEN
      NEW.assignee_typ := 'sachverstaendiger';
      NEW.assignee_id  := NEW.sv_id;
    ELSIF NEW.sv_lead_id IS NOT NULL THEN
      NEW.assignee_typ := 'sv_lead';
      NEW.assignee_id  := NEW.sv_lead_id;
    ELSIF NEW.kb_id IS NOT NULL THEN
      NEW.assignee_typ := 'kundenbetreuer';
      NEW.assignee_id  := NEW.kb_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_gutachter_termine_normalize_assignee
  BEFORE INSERT OR UPDATE OF sv_id, sv_lead_id, kb_id, assignee_typ, assignee_id
  ON public.gutachter_termine
  FOR EACH ROW EXECUTE FUNCTION public.gutachter_termine_normalize_assignee();
