-- AAR-581 (N4) — leads.sv_treffpunkt → strukturierte besichtigungsort_*-Felder.
-- Parität zu `faelle` (das dieselben vier Felder seit AAR-227 hat).
--
-- sv_treffpunkt war ein Freitextfeld für den SV-Treffpunkt — konzeptionell
-- identisch zum Besichtigungsort. Migration legt die 4 canonical-Spalten an,
-- backfilled `_adresse` aus sv_treffpunkt (lat/lng/place_id bleiben NULL, bis
-- der User in der Dispatch-UI einen strukturierten Autocomplete-Treffer
-- auswählt), dann wird die Legacy-Spalte gedroppt.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS besichtigungsort_adresse text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS besichtigungsort_lat numeric;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS besichtigungsort_lng numeric;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS besichtigungsort_place_id text;

UPDATE leads
SET besichtigungsort_adresse = sv_treffpunkt
WHERE sv_treffpunkt IS NOT NULL AND besichtigungsort_adresse IS NULL;

ALTER TABLE leads DROP COLUMN IF EXISTS sv_treffpunkt;
