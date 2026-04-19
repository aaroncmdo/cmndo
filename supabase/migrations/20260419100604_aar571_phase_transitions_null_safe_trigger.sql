-- AAR-571 (V5 Foundation, Null-Safe-Nachzug) — log_phase_transition-Function
-- + Trigger auf faelle. Wird vom Haupt-File (20260419100432) gebraucht,
-- kam als separater Nachzug weil der erste Entwurf ohne NULL-Check war und
-- einen Fall in "keine Phase zuordnenbar"-Zustand bei direkten UPDATEs
-- auf faelle.aktuelle_phase = NULL produziert hätte.
--
-- Reconstruction from live schema, 2026-04-19 (AAR-600 C2c Drift-Fix):
-- Dieses File fehlte im Repo, war aber remote bereits als Migration
-- 20260419100604 angewendet. Inhalt rekonstruiert via pg_proc /
-- pg_trigger.

CREATE OR REPLACE FUNCTION public.log_phase_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF (OLD.aktuelle_phase IS DISTINCT FROM NEW.aktuelle_phase) THEN
    -- Skip: wenn neue Phase NULL ist, ist das ein Reset — nicht loggen
    -- (faelle.aktuelle_phase=NULL bedeutet 'noch keine Phase zugewiesen')
    IF NEW.aktuelle_phase IS NULL THEN
      RETURN NEW;
    END IF;

    -- Dedup: wenn Helper bereits inserted hat in den letzten 2s, skip
    IF NOT EXISTS (
      SELECT 1 FROM public.phase_transitions
      WHERE fall_id = NEW.id
        AND to_phase = NEW.aktuelle_phase
        AND transition_at > NOW() - INTERVAL '2 seconds'
    ) THEN
      INSERT INTO public.phase_transitions (
        fall_id, from_phase, to_phase,
        transition_at, trigger_type, actor_rolle
      ) VALUES (
        NEW.id, OLD.aktuelle_phase, NEW.aktuelle_phase,
        NOW(), 'auto', 'system'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS faelle_phase_transition_trigger ON public.faelle;
CREATE TRIGGER faelle_phase_transition_trigger
  AFTER UPDATE OF aktuelle_phase ON public.faelle
  FOR EACH ROW
  EXECUTE FUNCTION public.log_phase_transition();
