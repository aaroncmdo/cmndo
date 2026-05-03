-- AAR-854 Migration 4/4: Sync-Trigger kanzlei_pakete → faelle.aktuelle_phase
--
-- Wenn ein Kanzlei-Paket auf 'versendet' geht, soll faelle.aktuelle_phase auf
-- 'kanzlei_fallakte_angelegt' springen. Greift Welle-6-UI für Kanzlei-Block.
-- Schutz: nicht in Endzuständen (vollzahlung_eingegangen, storniert) übersteuern.

CREATE OR REPLACE FUNCTION public.trg_fn_sync_kanzlei_paket_to_faelle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'versendet' AND (OLD.status IS NULL OR OLD.status != 'versendet') THEN
    UPDATE public.faelle
       SET aktuelle_phase = 'kanzlei_fallakte_angelegt',
           updated_at = now()
     WHERE claim_id = NEW.claim_id
       AND aktuelle_phase NOT IN ('vollzahlung_eingegangen','fall_akzeptiert_storniert');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_kanzlei_paket_to_faelle ON public.kanzlei_pakete;
CREATE TRIGGER trg_sync_kanzlei_paket_to_faelle
  AFTER INSERT OR UPDATE OF status ON public.kanzlei_pakete
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_sync_kanzlei_paket_to_faelle();

COMMENT ON FUNCTION public.trg_fn_sync_kanzlei_paket_to_faelle IS
  'AAR-854: Sync von kanzlei_pakete.status=versendet → faelle.aktuelle_phase. '
  'Schutz vor Endzustand-Override.';
