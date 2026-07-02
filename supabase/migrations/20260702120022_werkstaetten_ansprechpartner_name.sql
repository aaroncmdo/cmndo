-- Werkstatt-Auftrag-View (Task 2/5): direkter Ansprechpartner/GF-Name auf werkstaetten.
-- ansprechpartner_person_id ist tot (0/7 befuellt, keine persons-Tabelle) -> direktes Text-Feld.
ALTER TABLE public.werkstaetten ADD COLUMN IF NOT EXISTS ansprechpartner_name text;
COMMENT ON COLUMN public.werkstaetten.ansprechpartner_name IS 'Ansprechpartner/Geschaeftsfuehrer-Name (direktes Feld; ansprechpartner_person_id ist tot).';
