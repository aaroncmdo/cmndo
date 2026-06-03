-- CMM-50.1: vehicles Schema-Lücke schließen. 4 faelle-Fahrzeug-Spalten ohne
-- vehicles-Pendant additiv anlegen (rein additiv, kein Backfill hier — die
-- Befüllung kommt über den 50.0-Write-Path-Helper + Secondary-UPDATE).
-- lackfarbe_code wird NICHT neu angelegt (mappt auf bestehendes farbcode, Aaron-Entscheidung).
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS kennzeichen_buchstaben text,
  ADD COLUMN IF NOT EXISTS fahrzeug_ausstattung   jsonb,
  ADD COLUMN IF NOT EXISTS fin_quelle             text,
  ADD COLUMN IF NOT EXISTS fin_extrahiert_am       timestamptz;

COMMENT ON COLUMN public.vehicles.kennzeichen_buchstaben IS 'CMM-50.1: Buchstaben-Teil des Kennzeichens (Quelle faelle.kennzeichen_buchstaben).';
COMMENT ON COLUMN public.vehicles.fahrzeug_ausstattung   IS 'CMM-50.1: Ausstattungs-JSON (Quelle faelle.fahrzeug_ausstattung / Cardentity-Report).';
COMMENT ON COLUMN public.vehicles.fin_quelle             IS 'CMM-50.1: Provenance der FIN (zb1_ocr|manuell|gutachter_manuell|cardentity).';
COMMENT ON COLUMN public.vehicles.fin_extrahiert_am      IS 'CMM-50.1: Zeitpunkt der FIN-Gewinnung (Quelle faelle.fin_extrahiert_am).';
