-- b1: Reparatur-Auftrag ohne Kunden-Wunschtermin ermoeglichen.
-- Der Wunschtermin ist im FlowLink OPTIONAL (Kunde waehlt Werkstatt, muss aber kein
-- Datum angeben). Vorher NOT NULL -> convert-lead-to-claim legte die reparatur_termine-Row
-- nur bei (Werkstatt AND Wunschtermin) an -> ohne Wunschtermin keine Row ->
-- WerkstattAuftragDetail blendete die ganze Sektion (inkl. "Termin vorschlagen"-Button) aus
-- = toter Auftrag. Nullable machen: die Werkstatt kann dann selbst einen Termin vorschlagen
-- (status wechselt via schlageWerkstattTerminVor auf 'werkstatt_vorschlag'), auch wenn der
-- Kunde keinen Wunsch angegeben hat. status-CHECK erlaubt 'angefragt'/'werkstatt_vorschlag' bereits.
ALTER TABLE public.reparatur_termine
  ALTER COLUMN wunschtermin DROP NOT NULL;
