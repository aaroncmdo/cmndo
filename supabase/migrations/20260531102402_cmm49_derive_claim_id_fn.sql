-- CMM-49 FK-Re-Key: Ableitungs-Funktion, hält claim_id aus fall_id synchron,
-- bis Code claim_id nativ schreibt. SECURITY DEFINER, damit das faelle-Lookup
-- unabhängig von der RLS des INSERTenden Rolle funktioniert (sonst claim_id NULL
-- für authenticated-Writer). Wird mit fall_id zusammen gedroppt (Cutover-Phase).
CREATE OR REPLACE FUNCTION public.derive_claim_id_from_fall()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.fall_id IS NOT NULL
     AND (NEW.claim_id IS NULL
          OR (TG_OP = 'UPDATE' AND NEW.fall_id IS DISTINCT FROM OLD.fall_id)) THEN
    SELECT f.claim_id INTO NEW.claim_id FROM public.faelle f WHERE f.id = NEW.fall_id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.derive_claim_id_from_fall() IS
  'CMM-49 FK-Re-Key: leitet claim_id aus fall_id ab (BEFORE INSERT/UPDATE OF fall_id auf re-gekeyten Tischen). SECURITY DEFINER wegen faelle-RLS. Wird in der Cutover-Phase mit fall_id gedroppt.';
