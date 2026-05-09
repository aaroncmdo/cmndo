-- Self-Dispatch ZB1-OCR + Imagin-Visualisierung + Vorschaden-Hinweis.
-- Spalten landen direkt auf gutachter_finder_anfragen, weil der Kunde zu
-- diesem Zeitpunkt noch keinen vollwertigen Fall hat. Beim Konvertieren der
-- Anfrage zu einem Fall kopiert der Dispatch die Daten via separater Migration.

ALTER TABLE public.gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS fin_vin text,
  ADD COLUMN IF NOT EXISTS hsn text,
  ADD COLUMN IF NOT EXISTS tsn text,
  ADD COLUMN IF NOT EXISTS erstzulassung text,
  ADD COLUMN IF NOT EXISTS fahrzeug_baujahr int,
  ADD COLUMN IF NOT EXISTS fahrzeug_hersteller text,
  ADD COLUMN IF NOT EXISTS fahrzeug_modell text,
  ADD COLUMN IF NOT EXISTS fahrzeug_farbe text,
  ADD COLUMN IF NOT EXISTS halter_vorname text,
  ADD COLUMN IF NOT EXISTS halter_nachname text,
  ADD COLUMN IF NOT EXISTS halter_strasse text,
  ADD COLUMN IF NOT EXISTS halter_plz text,
  ADD COLUMN IF NOT EXISTS halter_stadt text,
  ADD COLUMN IF NOT EXISTS ocr_extrahiert_am timestamptz,
  ADD COLUMN IF NOT EXISTS ocr_rohdaten jsonb,
  ADD COLUMN IF NOT EXISTS imagin_url text,
  ADD COLUMN IF NOT EXISTS vorschaden_check_status text
    CHECK (vorschaden_check_status IN ('ausstehend', 'kein_vorschaden', 'vorschaden_erkannt', 'nicht_verfuegbar')),
  ADD COLUMN IF NOT EXISTS vorschaden_check_payload jsonb;

COMMENT ON COLUMN public.gutachter_finder_anfragen.imagin_url IS
  'Imagin-Studio CDN-URL fuer Fahrzeug-Visualisierung, gebaut aus make/model/year';
COMMENT ON COLUMN public.gutachter_finder_anfragen.vorschaden_check_status IS
  'CarDentity Typ-A Ergebnis: kein_vorschaden | vorschaden_erkannt | nicht_verfuegbar';
