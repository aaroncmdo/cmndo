-- 2026-05-12 Funnel v3 PR #6: Service-Typ + Kanzlei-Wahl als Phasen in
-- flow_key='gutachter-finden'. Vorher waren sie nur im Onboarding nach
-- Magic-Link — Aaron: "Die Vollmacht ist das wo wir Geld dran verdienen"
-- und Conversion-Rate ist im Self-Dispatch-Moment am hoechsten.
--
-- Phasen nach diesem Update:
--   10 standort  (Schritt 1 von 5)
--   20 termin    (Schritt 2 von 5)
--   25 service   (Schritt 3 von 5)   [NEU]
--   27 kanzlei   (Schritt 4 von 5, conditional service_typ=komplett)  [NEU]
--   30 kontakt   (Schritt 5 von 5)

BEGIN;

-- 1) Eyebrow der bestehenden 3 Phasen aktualisieren (5er-Zaehlung)
UPDATE public.onboarding_phasen
SET eyebrow = 'Schritt 1 von 5'
WHERE flow_key='gutachter-finden' AND phase_key='standort';

UPDATE public.onboarding_phasen
SET eyebrow = 'Schritt 2 von 5'
WHERE flow_key='gutachter-finden' AND phase_key='termin';

UPDATE public.onboarding_phasen
SET eyebrow = 'Schritt 5 von 5'
WHERE flow_key='gutachter-finden' AND phase_key='kontakt';

-- 2) NEU: Phase 'service' (reihenfolge=25)
INSERT INTO public.onboarding_phasen (flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung)
VALUES (
  'gutachter-finden',
  25,
  'service',
  'Wie sollen wir Sie unterstuetzen?',
  'Schritt 3 von 5',
  'Komplettservice mit Anwalt oder nur die Begutachtung — Sie haben die Wahl.'
);

INSERT INTO public.onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, optionen, db_target)
SELECT id, 10, 'service_typ', 'toggle-cards',
       'Service-Umfang',
       'Bei "Komplettservice" arbeiten wir mit unserer Partnerkanzlei LexDrive zusammen — kostenlos fuer Sie, wir regeln alles.',
       true,
       jsonb_build_array(
         jsonb_build_object(
           'value','komplett',
           'label','Komplettservice (empfohlen)',
           'description','Anwalt + Vollmacht inkl. — 0 EUR, wir regeln alles fuer Sie'
         ),
         jsonb_build_object(
           'value','nur_gutachter',
           'label','Nur Gutachten',
           'description','Sie regulieren selbst mit der gegnerischen Versicherung'
         )
       ),
       jsonb_build_object('tabelle','gutachter_finder_anfragen','spalte','regulierungs_modus')
FROM public.onboarding_phasen
WHERE flow_key='gutachter-finden' AND phase_key='service';

-- 3) NEU: Phase 'kanzlei' (reihenfolge=27, conditional_on service_typ=komplett)
INSERT INTO public.onboarding_phasen (flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung, conditional_on)
VALUES (
  'gutachter-finden',
  27,
  'kanzlei',
  'Welche Kanzlei soll uebernehmen?',
  'Schritt 4 von 5',
  'Bei der Partnerkanzlei kostet es Sie nichts und Sie haben einen direkten Ansprechpartner.',
  jsonb_build_object('feld','service_typ','equals','komplett')
);

INSERT INTO public.onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, optionen, db_target)
SELECT id, 10, 'kanzlei_wunsch', 'toggle-cards',
       'Anwalt-Wahl',
       NULL,
       true,
       jsonb_build_array(
         jsonb_build_object(
           'value','partnerkanzlei',
           'label','Unsere Partnerkanzlei (empfohlen)',
           'description','LexDrive — spezialisiert auf Kfz-Schaeden, 0 EUR fuer Sie, kuemmern sich um Vollmacht und alles weitere'
         ),
         jsonb_build_object(
           'value','eigene_kanzlei',
           'label','Meine eigene Kanzlei',
           'description','Sie geben uns die Kontaktdaten, wir uebergeben das Paket'
         ),
         jsonb_build_object(
           'value','keine_kanzlei',
           'label','Kein Anwalt',
           'description','Sie regulieren selbst — keine Anwalts-Begleitung'
         )
       ),
       jsonb_build_object('tabelle','gutachter_finder_anfragen','spalte','kanzlei_wunsch')
FROM public.onboarding_phasen
WHERE flow_key='gutachter-finden' AND phase_key='kanzlei';

-- 4) Verifikation
SELECT p.reihenfolge, p.phase_key, p.titel, p.eyebrow,
       p.conditional_on, count(f.id) AS felder
FROM public.onboarding_phasen p
LEFT JOIN public.onboarding_felder f ON f.phase_id = p.id
WHERE p.flow_key='gutachter-finden'
GROUP BY p.reihenfolge, p.phase_key, p.titel, p.eyebrow, p.conditional_on
ORDER BY p.reihenfolge;

COMMIT;
