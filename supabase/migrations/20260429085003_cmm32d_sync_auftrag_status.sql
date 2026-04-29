-- CMM-32d: Trigger spiegelt gutachter_termine-State auf auftraege.status.
--
-- Ohne dies müsste jeder App-Pfad (arrived(), completeBegutachtung(), GPS-
-- Auto-Arrival, manuelle Admin-Updates) parallel die Auftrags-Phase mit-
-- pflegen. Mit Trigger ist die Phase deterministisch aus dem Termin-State
-- abgeleitet — eine Wahrheit weniger im Code.

CREATE OR REPLACE FUNCTION public.tg_termin_sync_auftrag_status() RETURNS trigger AS $$
DECLARE
  v_neu_status text;
BEGIN
  IF NEW.auftrag_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Phase ableiten:
  --   durchgefuehrt_am gesetzt → 'gutachten' (Termin durch, Gutachten kommt noch)
  --   sv_angekommen_am gesetzt → 'besichtigung'
  --   sonst → 'termin'
  IF NEW.durchgefuehrt_am IS NOT NULL THEN
    v_neu_status := 'gutachten';
  ELSIF NEW.sv_angekommen_am IS NOT NULL THEN
    v_neu_status := 'besichtigung';
  ELSE
    v_neu_status := 'termin';
  END IF;

  -- Nur fortschreiten, nicht zurück. 'abgeschlossen' wird nur explizit per
  -- App gesetzt (QC-Freigabe), nicht hier.
  UPDATE public.auftraege
  SET status = v_neu_status
  WHERE id = NEW.auftrag_id
    AND status != 'abgeschlossen'
    AND CASE status
          WHEN 'termin' THEN 1
          WHEN 'besichtigung' THEN 2
          WHEN 'gutachten' THEN 3
          WHEN 'abgeschlossen' THEN 4
        END < CASE v_neu_status
          WHEN 'termin' THEN 1
          WHEN 'besichtigung' THEN 2
          WHEN 'gutachten' THEN 3
        END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS termin_sync_auftrag_status ON public.gutachter_termine;
CREATE TRIGGER termin_sync_auftrag_status
  AFTER INSERT OR UPDATE OF sv_angekommen_am, durchgefuehrt_am, auftrag_id
  ON public.gutachter_termine
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_termin_sync_auftrag_status();

COMMENT ON FUNCTION public.tg_termin_sync_auftrag_status IS
  'CMM-32d: spiegelt gutachter_termine-State (sv_angekommen_am, durchgefuehrt_am) auf auftraege.status. Nur Fortschritt, kein Rückwärts. abgeschlossen wird per QC-Pfad gesetzt.';
