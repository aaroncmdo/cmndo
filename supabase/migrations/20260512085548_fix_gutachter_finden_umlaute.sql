-- AAR-gutachter-finden-smoke 2026-05-12: Umlaut-Restauration für flow_key='gutachter-finden'.
-- Aaron-Bericht im Smoke: Texte zeigten "Sachverstaendige", "Naehe", "fuer",
-- "Strasse", "Koeln", "unterstuetzen" usw. statt echter Umlaute. Verstoß
-- gegen die UTF-8-Pflicht aus AGENTS.md.

BEGIN;

-- ─── onboarding_phasen ──────────────────────────────────────────────
UPDATE onboarding_phasen
SET beschreibung = 'Wir finden den passenden Sachverständigen in Ihrer Region.'
WHERE flow_key = 'gutachter-finden' AND phase_key = 'standort';

UPDATE onboarding_phasen
SET beschreibung = 'Verfügbare Termine in Ihrer Region.'
WHERE flow_key = 'gutachter-finden' AND phase_key = 'termin';

UPDATE onboarding_phasen
SET titel = 'Wie sollen wir Sie unterstützen?'
WHERE flow_key = 'gutachter-finden' AND phase_key = 'service';

UPDATE onboarding_phasen
SET titel = 'Welche Kanzlei soll übernehmen?'
WHERE flow_key = 'gutachter-finden' AND phase_key = 'kanzlei';

UPDATE onboarding_phasen
SET beschreibung = 'Damit wir den Termin bestätigen können.'
WHERE flow_key = 'gutachter-finden' AND phase_key = 'kontakt';

-- ─── onboarding_felder ──────────────────────────────────────────────
UPDATE onboarding_felder f
SET label = 'Straße, PLZ, Ort',
    placeholder = 'z.B. Musterstraße 12, 50667 Köln'
FROM onboarding_phasen p
WHERE f.phase_id = p.id
  AND p.flow_key = 'gutachter-finden'
  AND f.feld_key = 'besichtigungsort';

UPDATE onboarding_felder f
SET hint = 'Bei "Komplettservice" arbeiten wir mit unserer Partnerkanzlei LexDrive zusammen — kostenlos für Sie, wir regeln alles.'
FROM onboarding_phasen p
WHERE f.phase_id = p.id
  AND p.flow_key = 'gutachter-finden'
  AND f.feld_key = 'service_typ';

COMMIT;
