-- 2026-05-11: Funnel-Vereinfachung v2 (Aaron) — Karte = Matching-Ergebnis.
-- gutachter-finden Wizard reduziert auf 3 Phasen: standort, termin, kontakt+abschluss.
-- Schaden/Fahrzeug-Details wandern in /kunde/onboarding (separater Plan).
--
-- Phasen vorher: schaden (10), fahrzeug (20), termin (30), kontakt (40), abschluss (50)
-- Phasen nachher: standort (10), termin (20), kontakt (30) -- abschluss in kontakt merged

BEGIN;

-- 1) Alte schaden + fahrzeug Phasen + ihre Felder loeschen
DELETE FROM public.onboarding_felder
WHERE phase_id IN (
  SELECT id FROM public.onboarding_phasen
  WHERE flow_key = 'gutachter-finden' AND phase_key IN ('schaden', 'fahrzeug')
);
DELETE FROM public.onboarding_phasen
WHERE flow_key = 'gutachter-finden' AND phase_key IN ('schaden', 'fahrzeug');

-- 2) Neue 'standort' Phase einfuegen (reihenfolge=10)
INSERT INTO public.onboarding_phasen (flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung)
VALUES (
  'gutachter-finden',
  10,
  'standort',
  'Wo steht das Fahrzeug?',
  'Schritt 1 von 3',
  'Wir finden den passenden Sachverstaendigen in Ihrer Region.'
);

INSERT INTO public.onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, db_target)
SELECT id, 10, 'besichtigungsort', 'text', 'Strasse, PLZ, Ort',
       'Adresse wo das Fahrzeug besichtigt werden soll',
       'z.B. Musterstrasse 12, 50667 Koeln',
       true,
       jsonb_build_object('tabelle','gutachter_finder_anfragen','spalte','besichtigungsort_adresse')
FROM public.onboarding_phasen
WHERE flow_key='gutachter-finden' AND phase_key='standort';

-- 3) termin-Phase: reihenfolge 30 → 20, Titel anpassen
UPDATE public.onboarding_phasen
SET reihenfolge = 20,
    titel = 'Wann passt es Ihnen?',
    eyebrow = 'Schritt 2 von 3',
    beschreibung = 'Verfuegbare Termine in Ihrer Region.'
WHERE flow_key='gutachter-finden' AND phase_key='termin';

-- 4) kontakt-Phase: reihenfolge 40 → 30, Titel anpassen
UPDATE public.onboarding_phasen
SET reihenfolge = 30,
    titel = 'Ihre Kontaktdaten',
    eyebrow = 'Schritt 3 von 3',
    beschreibung = 'Damit wir den Termin bestaetigen koennen.'
WHERE flow_key='gutachter-finden' AND phase_key='kontakt';

-- 5) abschluss-Phase: DSGVO-Feld in kontakt-Phase verschieben, dann abschluss-Phase loeschen
WITH kontakt_id AS (
  SELECT id FROM public.onboarding_phasen
  WHERE flow_key='gutachter-finden' AND phase_key='kontakt'
)
UPDATE public.onboarding_felder
SET phase_id = (SELECT id FROM kontakt_id), reihenfolge = 99
WHERE phase_id IN (
  SELECT id FROM public.onboarding_phasen
  WHERE flow_key='gutachter-finden' AND phase_key='abschluss'
);

DELETE FROM public.onboarding_phasen
WHERE flow_key='gutachter-finden' AND phase_key='abschluss';

-- 6) Verifikation
SELECT p.reihenfolge, p.phase_key, p.titel, count(f.id) AS felder
FROM public.onboarding_phasen p
LEFT JOIN public.onboarding_felder f ON f.phase_id = p.id
WHERE p.flow_key='gutachter-finden'
GROUP BY p.reihenfolge, p.phase_key, p.titel
ORDER BY p.reihenfolge;

COMMIT;
