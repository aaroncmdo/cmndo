-- AAR-353: faelle.vorschaden_erkannt — Flag, das CarDentity/Fahrzeughistorie
-- liefert wenn ein Vorschaden erkannt wurde. Wird von den Katalog-Regeln für
-- reparaturrechnung_vorschaden + kaufvertrag genutzt (Pflichtdokumente werden
-- freigeschaltet sobald der Flag auf true geht).
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vorschaden_erkannt boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN faelle.vorschaden_erkannt IS 'AAR-353: true = CarDentity-Abfrage hat Vorschaden festgestellt; triggert Pflichtdokumente reparaturrechnung_vorschaden + kaufvertrag.';;
