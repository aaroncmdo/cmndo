-- KFZ-140/BUG-78: schadens_ursache ↔ schadensursache bidirektional synchron halten
-- Problem: Codebase nutzt schadens_ursache (40+ Stellen), UI-Display nutzt schadensursache.
-- Beide Spalten bleiben bestehen, Trigger hält sie synchron.

-- Daten synchronisieren (schadens_ursache → schadensursache fuer Bestand)
UPDATE faelle SET schadensursache = schadens_ursache
  WHERE schadensursache IS NULL AND schadens_ursache IS NOT NULL;

-- Trigger: hält beide Spalten synchron egal welche geschrieben wird
CREATE OR REPLACE FUNCTION sync_faelle_ursache() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.schadensursache IS DISTINCT FROM OLD.schadensursache THEN
    NEW.schadens_ursache := NEW.schadensursache;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.schadens_ursache IS DISTINCT FROM OLD.schadens_ursache THEN
    NEW.schadensursache := NEW.schadens_ursache;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_faelle_ursache ON faelle;
CREATE TRIGGER trg_sync_faelle_ursache
  BEFORE INSERT OR UPDATE ON faelle
  FOR EACH ROW EXECUTE FUNCTION sync_faelle_ursache();
