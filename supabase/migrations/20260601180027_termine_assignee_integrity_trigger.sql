-- Unisone Termin-Engine Phase 1 / Task 3
-- Assignee-Integritaets-Guard (validate-when-set): eine gesetzte assignee_id muss
-- in der typ-passenden Tabelle existieren. Lehre aus abrechnungen.empfaenger
-- (polymorph ohne FK -> 2/3 NULL). NULL erlaubt (Status sv_gesucht). Feuert nur
-- bei INSERT oder UPDATE der assignee-Spalten -> bestehende Status-Writer unberuehrt.
-- search_path='' per Repo-Konvention (aar_function_search_path_lock); alle Refs
-- voll qualifiziert.
CREATE OR REPLACE FUNCTION public.gutachter_termine_validate_assignee()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF NEW.assignee_id IS NULL THEN
    RETURN NEW;  -- unassigned (z.B. status sv_gesucht) erlaubt
  END IF;
  IF NEW.assignee_typ = 'sachverstaendiger' THEN
    IF NOT EXISTS (SELECT 1 FROM public.sachverstaendige WHERE id = NEW.assignee_id) THEN
      RAISE EXCEPTION 'assignee_id % nicht in sachverstaendige', NEW.assignee_id;
    END IF;
  ELSIF NEW.assignee_typ = 'sv_lead' THEN
    IF NOT EXISTS (SELECT 1 FROM public.sv_leads WHERE id = NEW.assignee_id) THEN
      RAISE EXCEPTION 'assignee_id % nicht in sv_leads', NEW.assignee_id;
    END IF;
  ELSIF NEW.assignee_typ = 'kundenbetreuer' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.assignee_id) THEN
      RAISE EXCEPTION 'assignee_id % nicht in profiles', NEW.assignee_id;
    END IF;
  ELSIF NEW.assignee_typ = 'kanzlei' THEN
    IF NOT EXISTS (SELECT 1 FROM public.kanzleien WHERE id = NEW.assignee_id) THEN
      RAISE EXCEPTION 'assignee_id % nicht in kanzleien', NEW.assignee_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'assignee_id gesetzt, assignee_typ % ungueltig', NEW.assignee_typ;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_gutachter_termine_validate_assignee
  BEFORE INSERT OR UPDATE OF assignee_typ, assignee_id ON public.gutachter_termine
  FOR EACH ROW EXECUTE FUNCTION public.gutachter_termine_validate_assignee();
