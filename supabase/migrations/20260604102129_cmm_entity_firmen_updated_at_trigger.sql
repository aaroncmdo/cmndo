-- CMM Entity (b1, Re-Validierung-Fund): firmen.updated_at-Auto-Trigger (Konsistenz mit
-- vehicles/claim_parties, die je einen set_<table>_updated_at-Trigger haben). search_path
-- gelockt (Projekt-Konvention aar_function_search_path_lock).
CREATE OR REPLACE FUNCTION public.set_firmen_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_firmen_updated_at
  BEFORE UPDATE ON public.firmen
  FOR EACH ROW EXECUTE FUNCTION public.set_firmen_updated_at();
