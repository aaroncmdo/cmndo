-- CMM-32: BEFORE-Trigger spiegelt durchgefuehrt_am → status='abgeschlossen'.
--
-- Damit zeigen Kalender-Views (Kunde / KB / Admin / SV) den Termin sofort
-- als "✓ Besichtigt" ohne ein weiteres Feld lesen zu müssen. status ist
-- die kanonische Quelle für Termin-Lifecycle.

CREATE OR REPLACE FUNCTION public.tg_termin_status_durchgefuehrt() RETURNS trigger AS $$
BEGIN
  IF NEW.durchgefuehrt_am IS NOT NULL
     AND (OLD IS NULL OR OLD.durchgefuehrt_am IS DISTINCT FROM NEW.durchgefuehrt_am)
     AND NEW.status NOT IN ('abgeschlossen', 'storniert', 'abgesagt') THEN
    NEW.status := 'abgeschlossen';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS termin_status_durchgefuehrt ON public.gutachter_termine;
CREATE TRIGGER termin_status_durchgefuehrt
  BEFORE INSERT OR UPDATE OF durchgefuehrt_am
  ON public.gutachter_termine
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_termin_status_durchgefuehrt();

-- Backfill: bestehende Termine mit durchgefuehrt_am aber status != durchgefuehrt
UPDATE public.gutachter_termine
SET status = 'abgeschlossen'
WHERE durchgefuehrt_am IS NOT NULL
  AND status NOT IN ('abgeschlossen', 'storniert', 'abgesagt');

COMMENT ON FUNCTION public.tg_termin_status_durchgefuehrt IS
  'CMM-32: BEFORE-Trigger setzt termin.status = durchgefuehrt sobald durchgefuehrt_am gesetzt wird. Damit Kalender-Views einheitlich rendern können.';
