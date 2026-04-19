-- AAR-575 (A1): Kunde-Stammdaten auf faelle retten, wenn Kunde ≠ Halter.
--
-- Hintergrund: leads.vorname/nachname/email/telefon + leads.kunde_strasse/plz/
-- stadt/adresse/lat/lng enthalten bei ist_fahrzeughalter=false (Ehepartner,
-- Firmenfahrzeug usw.) Daten, die der Lead→Fall-Converter bisher verwarf,
-- weil faelle nur halter_* kennt. Ohne diese Spalten verlieren wir beim
-- Handoff die Anschrift des tatsächlichen Mandanten.
--
-- Die Kunden-Identität (profiles.id) hängt weiterhin an faelle.kunde_id.
-- Die hier neu hinzugefügten Spalten sind Stammdaten-Snapshot zum Zeitpunkt
-- der Fall-Erzeugung — parallel zur bestehenden halter_*-Familie.

ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS kunde_vorname text;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS kunde_nachname text;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS kunde_telefon text;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS kunde_email text;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS kunde_strasse text;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS kunde_plz text;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS kunde_stadt text;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS kunde_adresse text;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS kunde_lat numeric;
ALTER TABLE public.faelle ADD COLUMN IF NOT EXISTS kunde_lng numeric;

COMMENT ON COLUMN public.faelle.kunde_vorname IS 'AAR-575: Kunde-Vorname bei ist_fahrzeughalter=false (abweichend von halter_vorname)';
COMMENT ON COLUMN public.faelle.kunde_strasse IS 'AAR-575: Anschrift des Mandanten wenn Kunde ≠ Halter';
