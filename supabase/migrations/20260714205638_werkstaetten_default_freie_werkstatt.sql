-- Spec B: Startwert fuer die Marken-Achse (Aaron 14.07.).
--
-- Die 15 aktiven Partner sind Karosserie-/Lack-/Mechanik-Betriebe (Suelzer Autoservice, Colour Master,
-- Picarsso, ...) — also markenoffene FREIE Werkstaetten, keine Marken-Vertragswerkstaetten. Ohne diesen
-- Startwert waere ihr Marken-Match 'unbekannt' und sie wuerden schlechter ranken als eine kuenftig
-- gepflegte Markenwerkstatt, obwohl sie den Wagen sehr wohl reparieren.
--
-- fahrzeug_gruppen wird BEWUSST NICHT gesetzt: ein Default ARRAY['pkw'] wuerde sie bei einem LKW-Schaden
-- HART AUSSCHLIESSEN (die Gruppe ist ein harter Filter). NULL = 'unbekannt' -> nicht ausschliessen, aber
-- schlechter ranken als eine Werkstatt, die ihre Gruppen gepflegt hat. Sicherer Zustand bis zur Pflege.
--
-- OFFEN (Datenpflege, nicht Code): welche Werkstatt fuehrt welche MARKEN, und welche FAHRZEUG-GRUPPEN
-- kann sie (LKW? Transporter? Motorrad?). Das gehoert in die Werkstatt-Stammdaten-UI.
UPDATE public.werkstaetten
   SET ist_freie_werkstatt = true
 WHERE ist_freie_werkstatt IS NULL
   AND (marken IS NULL OR array_length(marken, 1) IS NULL);
