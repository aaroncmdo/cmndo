-- Die gezeichnete Unterschrift dauerhaft in der ZEILE speichern, nicht nur eingebettet im PDF.
--
-- ANLASS (21.08.2026): 5 unterzeichnete Nutzungsbedingungen-PDFs (22.04.-07.05.) sind aus dem
-- Storage verschwunden. Name, Datum, IP und User-Agent standen weiter in der Zeile — nur das
-- Signaturbild war weg, weil es AUSSCHLIESSLICH im PDF existierte. Damit war das PDF ein
-- Single Point of Failure fuer den einzigen bildlichen Beleg.
--
-- Warum in die DB und nicht in den Storage: Der beobachtete Verlust traf den Storage, die
-- Zeilen blieben. Ein Signaturstrich ist klein (typisch 5-30 KB als data-URI), und er gehoert
-- inhaltlich zum Vertragsschluss wie unterschrift_ip — das steht ebenfalls in der Zeile.
--
-- Das PDF bleibt die Ausfertigung; mit diesem Feld ist es jederzeit originalgetreu
-- rekonstruierbar.
ALTER TABLE public.vertraege_unterzeichnet
  ADD COLUMN IF NOT EXISTS signature_png_data_uri text;

COMMENT ON COLUMN public.vertraege_unterzeichnet.signature_png_data_uri IS
  'Gezeichnete Unterschrift als PNG-data-URI. Dauerhafter Beleg unabhaengig vom PDF im Storage (21.08.2026: 5 Vertrags-PDFs verloren, Signatur existierte nur dort). NULL = Vertrag ohne gezeichnete Signatur (reine Klick-Zustimmung).';
