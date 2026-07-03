-- SP2: Reparatur-Wunschtermin am Lead (im Flow nach Werkstatt-Wahl gesetzt).
-- Bei Lead->Claim-Conversion wird daraus die reparatur_termine-Zeile (status=angefragt).
-- Getrennt von leads.wunschtermin (das ist der SV-Besichtigungs-Wunschtermin).

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS reparatur_wunschtermin timestamptz;

COMMENT ON COLUMN public.leads.reparatur_wunschtermin IS
  'Vom Kunden im Flow (nach Werkstatt-Wahl) vorgeschlagener Reparatur-Wunschtermin (UTC). Bei Lead->Claim-Conversion -> reparatur_termine (status=angefragt). Getrennt von leads.wunschtermin (SV-Besichtigung).';
