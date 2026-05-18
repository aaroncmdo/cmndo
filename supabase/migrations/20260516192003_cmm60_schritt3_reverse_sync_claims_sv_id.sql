-- CMM-60 Schritt 3 — Reverse-Sync-Trigger claims.sv_id -> faelle.sv_id.
--
-- Schritt 1 hat faelle.sv_id -> claims.sv_id gespiegelt. Schritt 3 stellt die
-- Writer auf claims.sv_id um; dieser Reverse-Trigger haelt faelle.sv_id fuer
-- die noch faelle-lesenden Stellen synchron. Beide Trigger sind
-- pg_trigger_depth-guarded -> bidirektionale Sync ohne Loop. Der
-- faelle->claims-Trigger bleibt bis Phase 6 (faelle-Drop).
--
-- Spec: docs/superpowers/specs/2026-05-16-cmm60-schritt3-sv-id-writer-design.md

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_claims_sv_id_to_faelle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.sv_id IS DISTINCT FROM OLD.sv_id THEN
    UPDATE public.faelle f
    SET sv_id = NEW.sv_id
    WHERE f.claim_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_claims_sv_id_to_faelle ON public.claims;
CREATE TRIGGER trg_sync_claims_sv_id_to_faelle
  AFTER INSERT OR UPDATE OF sv_id ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.sync_claims_sv_id_to_faelle();

COMMENT ON FUNCTION public.sync_claims_sv_id_to_faelle() IS
  'CMM-60 Schritt 3: spiegelt claims.sv_id -> faelle.sv_id. pg_trigger_depth-Guard gegen Loop mit trg_sync_faelle_sv_id_to_claims. Faellt mit dem faelle-Drop (Phase 6) weg.';

COMMIT;
