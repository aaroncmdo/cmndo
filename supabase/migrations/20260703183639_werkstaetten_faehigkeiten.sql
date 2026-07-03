-- Werkstatt-Matching SP1: physische Faehigkeiten der Werkstatt (fuer fachliches Matching).
-- NULL/leer = Vollservice (deckt alle Schadenskategorien ab) -> Bestandspartner nicht ausgeschlossen.
ALTER TABLE public.werkstaetten ADD COLUMN IF NOT EXISTS faehigkeiten text[];
COMMENT ON COLUMN public.werkstaetten.faehigkeiten IS
  'Werkstatt-Faehigkeiten (karosserie/lackierung/mechanik/glas/smart_repair); NULL/leer = Vollservice = alle Kategorien.';
