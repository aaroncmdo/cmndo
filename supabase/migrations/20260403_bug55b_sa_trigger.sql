-- BUG-55: DB-Trigger — SA unterschrieben → termin_status automatisch bestätigt
CREATE OR REPLACE FUNCTION trigger_sa_bestaetigt_termin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sa_unterschrieben = true AND (OLD.sa_unterschrieben IS NULL OR OLD.sa_unterschrieben = false) THEN
    IF NEW.gutachter_termin_status = 'reserviert' OR NEW.gutachter_termin_status IS NULL THEN
      NEW.gutachter_termin_status := 'bestaetigt';
    END IF;
    UPDATE gutachter_termine SET status = 'bestaetigt' WHERE fall_id = NEW.id AND status = 'reserviert';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sa_bestaetigt_termin ON faelle;
CREATE TRIGGER trg_sa_bestaetigt_termin
  BEFORE UPDATE ON faelle
  FOR EACH ROW
  EXECUTE FUNCTION trigger_sa_bestaetigt_termin();
