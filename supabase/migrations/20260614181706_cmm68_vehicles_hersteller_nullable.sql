-- CMM-68 (vehicles-Write-Path-Vervollstaendigung): hersteller nullable machen.
-- Begruendung: FIN-lose Fahrzeug-Stubs (frueher Claim / OCR-ohne-FIN / manuelle Anlage)
-- kennen den Hersteller evtl. noch nicht — Kennzeichen kommt frueh, Hersteller/FIN
-- werden spaeter via ZB1/Cardentity nachgezogen. NOT NULL blockierte createVehicleStub.
-- Relaxierung (DROP NOT NULL) ist verlustfrei: bestehende Rows behalten ihren Wert.
ALTER TABLE public.vehicles ALTER COLUMN hersteller DROP NOT NULL;
COMMENT ON COLUMN public.vehicles.hersteller IS 'CMM-68: nullable — FIN-lose Stubs kennen den Hersteller evtl. noch nicht (wird via ZB1/Enrich nachgezogen).';
