-- AAR-305: werkstatt_seit_datum + fahrzeug_fahrbereit für Onboarding v2 +
-- Dispatch-Pflicht-Banner (Mietwagen-Empfehlung + schadenhergang-Check)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS werkstatt_seit_datum date;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS werkstatt_seit_datum date;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS fahrzeug_fahrbereit boolean;

COMMENT ON COLUMN leads.werkstatt_seit_datum IS 'AAR-305: Datum seit dem das Fahrzeug in der Werkstatt steht.';
COMMENT ON COLUMN faelle.werkstatt_seit_datum IS 'AAR-305: Gespiegelt vom Lead beim Fall-Anlegen.';
COMMENT ON COLUMN faelle.fahrzeug_fahrbereit IS 'AAR-305: Gespiegelt vom Lead — steuert Dispatch-Pflicht-Banner.';;
