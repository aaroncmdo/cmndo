-- AAR-854 Migration 3/4: Sync-Trigger claims → faelle (forward-only)
--
-- Bei jedem UPDATE auf claims.phase oder claims.status wird die zugehörige
-- faelle-Row aktualisiert. faelle.status mappt 1:1, faelle.aktuelle_phase
-- via map_claim_phase_to_faelle_phase().

CREATE OR REPLACE FUNCTION public.trg_fn_sync_claims_to_faelle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.phase IS DISTINCT FROM OLD.phase)
     OR (NEW.status IS DISTINCT FROM OLD.status) THEN

    UPDATE public.faelle
       SET aktuelle_phase = public.map_claim_phase_to_faelle_phase(NEW.phase, NEW.status, NEW.id),
           status = CASE NEW.status
             WHEN 'dispatch_done'                 THEN 'onboarding'
             WHEN 'in_bearbeitung'                THEN 'in_bearbeitung'
             WHEN 'in_kommunikation_vs'           THEN 'vs_kontakt'
             WHEN 'reguliert'                     THEN 'reguliert'
             WHEN 'abgelehnt'                     THEN 'abgelehnt'
             WHEN 'an_externe_kanzlei_uebergeben' THEN 'kanzlei'
             WHEN 'storniert'                     THEN 'storniert'
             ELSE status
           END,
           updated_at = now()
     WHERE claim_id = NEW.id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_claims_to_faelle ON public.claims;
CREATE TRIGGER trg_sync_claims_to_faelle
  AFTER UPDATE OF status, phase ON public.claims
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_sync_claims_to_faelle();

COMMENT ON FUNCTION public.trg_fn_sync_claims_to_faelle IS
  'AAR-854: Forward-only Sync von claims → faelle. Reverse-Sync nicht nötig — '
  'claims ist SSoT, faelle wird abgeleitet. Welle-6-UI nutzt faelle weiter.';
