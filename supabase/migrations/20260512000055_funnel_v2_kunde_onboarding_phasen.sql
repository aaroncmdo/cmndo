-- 2026-05-12 Funnel v2 PR #4: Skeleton-Phasen fuer flow_key='kunde-onboarding'.
-- Wird vom datenabhaengigen Loader (ladeNoetigePhasen) gerendert — Phasen
-- werden uebersprungen wenn alle Pflichtfelder bereits in faelle/claims/
-- leads/vehicles vorhanden sind.
--
-- 4 Phasen zum Start. Weitere (Fotos, Polizeibericht-Upload, ZB1-OCR)
-- folgen im Plan-PR.

BEGIN;

-- Falls bereits existiert (Re-Run-Safe): bestehende Eintraege loeschen
DELETE FROM public.onboarding_felder
WHERE phase_id IN (SELECT id FROM public.onboarding_phasen WHERE flow_key='kunde-onboarding');
DELETE FROM public.onboarding_phasen WHERE flow_key='kunde-onboarding';

-- Phase 1: Schaden-Hergang
INSERT INTO public.onboarding_phasen (flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung)
VALUES ('kunde-onboarding', 10, 'hergang', 'Was ist passiert?',
        'Schritt 1', 'Beschreiben Sie kurz wie der Unfall zustande kam.');

INSERT INTO public.onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, db_target)
SELECT id, 10, 'hergang_kunde_text', 'textarea',
       'Unfallhergang in eigenen Worten',
       'Mindestens 3-4 Saetze. Was Sie selbst gesehen / erlebt haben.',
       'Z.B.: Ich stand an der roten Ampel als der hintere Wagen aufgefahren ist...',
       true,
       jsonb_build_object('tabelle','claims','spalte','hergang_kunde_text')
FROM public.onboarding_phasen
WHERE flow_key='kunde-onboarding' AND phase_key='hergang';

-- Phase 2: Service-Wahl (komplett vs nur_gutachter)
INSERT INTO public.onboarding_phasen (flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung)
VALUES ('kunde-onboarding', 20, 'service', 'Wie sollen wir Sie unterstuetzen?',
        'Schritt 2', 'Vollservice mit Anwalt oder nur die Begutachtung?');

INSERT INTO public.onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, optionen, db_target)
SELECT id, 10, 'service_typ', 'toggle-cards',
       'Service-Umfang',
       'Bei "Komplett" arbeiten wir mit unserer Partnerkanzlei LexDrive zusammen — kostenlos fuer Sie.',
       true,
       jsonb_build_array(
         jsonb_build_object(
           'value','komplett',
           'label','Komplettservice',
           'description','Mit Anwalt + Vollmacht — 0 EUR fuer Sie, wir regeln alles'
         ),
         jsonb_build_object(
           'value','nur_gutachter',
           'label','Nur Gutachten',
           'description','Sie regulieren selbst, wir bestellen den Sachverstaendigen'
         )
       ),
       jsonb_build_object('tabelle','faelle','spalte','service_typ')
FROM public.onboarding_phasen
WHERE flow_key='kunde-onboarding' AND phase_key='service';

-- Phase 3: Kanzlei-Wahl (nur bei service_typ='komplett')
INSERT INTO public.onboarding_phasen (flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung, conditional_on)
VALUES ('kunde-onboarding', 30, 'kanzlei', 'Welche Kanzlei?',
        'Schritt 3', 'Sie haben die Wahl. Bei Partnerkanzlei kostet es Sie nichts.',
        jsonb_build_object('feld','service_typ','equals','komplett'));

INSERT INTO public.onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, optionen, db_target)
SELECT id, 10, 'kanzlei_wunsch', 'toggle-cards',
       'Anwalt-Wahl',
       NULL,
       true,
       jsonb_build_array(
         jsonb_build_object(
           'value','partnerkanzlei',
           'label','Unsere Partnerkanzlei',
           'description','LexDrive — auf Kfz-Schaeden spezialisiert, 0 EUR'
         ),
         jsonb_build_object(
           'value','eigene_kanzlei',
           'label','Meine eigene Kanzlei',
           'description','Sie geben uns die Kontaktdaten, wir uebergeben'
         ),
         jsonb_build_object(
           'value','keine_kanzlei',
           'label','Kein Anwalt',
           'description','Sie regulieren selbst, wir liefern nur das Gutachten'
         )
       ),
       jsonb_build_object('tabelle','claims','spalte','kanzlei_wunsch')
FROM public.onboarding_phasen
WHERE flow_key='kunde-onboarding' AND phase_key='kanzlei';

-- Phase 4: Schaden-Abtretung (SA) Signatur
INSERT INTO public.onboarding_phasen (flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung)
VALUES ('kunde-onboarding', 40, 'sa', 'Schaden-Abtretung unterschreiben',
        'Schritt 4', 'Damit wir den Sachverstaendigen direkt bei der Versicherung abrechnen koennen.');

INSERT INTO public.onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, db_target)
SELECT id, 10, 'sa_signatur_data_url', 'signature',
       'Ihre Unterschrift',
       'Unterschreiben Sie mit Maus / Finger. Die SA-Vollmacht koennen Sie hier nochmal lesen.',
       true,
       jsonb_build_object('tabelle','faelle','spalte','sa_signatur_data_url')
FROM public.onboarding_phasen
WHERE flow_key='kunde-onboarding' AND phase_key='sa';

INSERT INTO public.onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, db_target)
SELECT id, 20, 'dsgvo_onboarding', 'checkbox',
       'Ich stimme der Verarbeitung meiner Daten gemaess der Datenschutzerklaerung zu',
       NULL,
       true,
       jsonb_build_object('tabelle','faelle','spalte','dsgvo_zustimmung_am')
FROM public.onboarding_phasen
WHERE flow_key='kunde-onboarding' AND phase_key='sa';

-- Verifikation
SELECT p.reihenfolge, p.phase_key, p.titel, count(f.id) AS felder
FROM public.onboarding_phasen p
LEFT JOIN public.onboarding_felder f ON f.phase_id = p.id
WHERE p.flow_key='kunde-onboarding'
GROUP BY p.reihenfolge, p.phase_key, p.titel
ORDER BY p.reihenfolge;

COMMIT;
