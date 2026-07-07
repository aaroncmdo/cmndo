-- Nutzungsausfall-Klassentabelle (A-L) mit festem Tagessatz je Klasse.
--
-- Loest fuer den Anspruchspruefer den groben Segment-Tagessatz beim Nutzungsausfall ab:
-- Klasse wird aus dem Segment abgeleitet (Code: nutzungsausfall-klasse.ts), Altersabschlag
-- (>5J -1 Klasse, >10J -2 Klassen) in reiner Logik. Diese Tabelle liefert die Saetze und
-- kann die kanonische Code-Konstante STANDARD_KLASSE_SAETZE ohne Deploy uebersteuern.
--
-- RLS + Read-Policy exakt wie die Schwester-Tabelle nutzungsausfall_segment_saetze
-- (public readable reference data; Schreibzugriff nur service_role via RLS-Bypass).

CREATE TABLE public.nutzungsausfall_klasse_saetze (
  klasse text PRIMARY KEY,
  euro_pro_tag numeric NOT NULL,
  bezeichnung text,
  beispiele text
);

ALTER TABLE public.nutzungsausfall_klasse_saetze ENABLE ROW LEVEL SECURITY;

CREATE POLICY nutzungsausfall_klasse_read
  ON public.nutzungsausfall_klasse_saetze
  FOR SELECT TO authenticated, anon
  USING (true);

INSERT INTO public.nutzungsausfall_klasse_saetze (klasse, euro_pro_tag, bezeichnung, beispiele) VALUES
  ('A', 23,  'Kleinstwagen',          'Smart, VW up!'),
  ('B', 29,  'Kleinwagen',            'VW Polo, Ford Fiesta, Opel Corsa'),
  ('C', 35,  'Kompaktklasse',         'VW Golf (Basis), Opel Astra'),
  ('D', 38,  'untere Mittelklasse',   'VW Golf (stärker motorisiert), Ford Focus'),
  ('E', 43,  'Mittelklasse',          'VW Passat, BMW 3er'),
  ('F', 50,  'obere Mittelklasse',    'Audi A4, Mercedes C-Klasse'),
  ('G', 59,  'Oberklasse',            'Audi A6, BMW 5er'),
  ('H', 65,  'Luxusklasse',           'Mercedes E-Klasse, Lexus ES'),
  ('J', 79,  'Oberklasse (SUV/Van)',  'BMW X5, Audi Q7'),
  ('K', 119, 'Sportwagen/Oberklasse', 'Porsche 911, Mercedes S-Klasse'),
  ('L', 175, 'Luxus-Sportwagen',      'Lamborghini, Ferrari');
