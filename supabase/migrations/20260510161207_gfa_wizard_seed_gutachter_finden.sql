-- PR 5: Seed — Flow "gutachter-finden" Phasen + Felder
--
-- 5 Phasen:
--   1. schaden     — Schadentyp + Schuldfrage
--   2. fahrzeug    — Fahrzeugdaten
--   3. termin      — Wunschtermin-Wann (Picker) + Slot (SlotField)
--   4. kontakt     — Vorname, Nachname, Telefon, E-Mail, Kanal
--   5. abschluss   — DSGVO-Checkbox + Signatur
--
-- plan: docs/plans/dynamic-onboarding-plan-2026-05-10.md PR 5

-- ────────────────────────────────────────────────
-- Phasen
-- ────────────────────────────────────────────────
INSERT INTO onboarding_phasen
  (flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung)
VALUES
  ('gutachter-finden', 10, 'schaden',
   'Was ist passiert?',
   'Schritt 1 von 5',
   'Kurze Infos zum Schaden helfen uns, den richtigen Sachverständigen für Sie zu finden.'),

  ('gutachter-finden', 20, 'fahrzeug',
   'Ihr Fahrzeug',
   'Schritt 2 von 5',
   'Fahrzeugdaten werden für das Gutachten benötigt.'),

  ('gutachter-finden', 30, 'termin',
   'Wann soll der Termin stattfinden?',
   'Schritt 3 von 5',
   'Wählen Sie einen freien Termin beim Sachverständigen in Ihrer Nähe.'),

  ('gutachter-finden', 40, 'kontakt',
   'Ihre Kontaktdaten',
   'Schritt 4 von 5',
   'Damit der Sachverständige Sie zur Bestätigung erreichen kann.'),

  ('gutachter-finden', 50, 'abschluss',
   'Fast geschafft!',
   'Schritt 5 von 5',
   'Bitte bestätigen Sie Ihre Anfrage mit Ihrer digitalen Unterschrift.')
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────
-- Felder — Phase 1: schaden
-- ────────────────────────────────────────────────
INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, optionen, db_target)
SELECT
  p.id, 10, 'schadentyp', 'toggle-cards',
  'Art des Schadens',
  'Wählen Sie die Schadenart, die am besten passt.',
  true,
  '[
    {"value":"auffahrunfall","label":"Auffahrunfall","icon":"car-crash"},
    {"value":"parkschaden","label":"Parkschaden","icon":"parking"},
    {"value":"kreuzungsunfall","label":"Kreuzungsunfall","icon":"intersection"},
    {"value":"wildschaden","label":"Wildschaden","icon":"deer"},
    {"value":"sonstiges","label":"Sonstiges","icon":"more"}
  ]'::jsonb,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"schadentyp"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'schaden'
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, optionen, db_target)
SELECT
  p.id, 20, 'schuldfrage', 'segmented',
  'Wer hat den Schaden verursacht?',
  NULL,
  true,
  '[
    {"value":"gegner","label":"Die Gegenseite"},
    {"value":"unklar","label":"Unklar"},
    {"value":"teilschuld","label":"Teilschuld"}
  ]'::jsonb,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"schuldfrage"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'schaden'
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, db_target)
SELECT
  p.id, 30, 'schadens_kurzbeschreibung', 'textarea',
  'Kurze Beschreibung',
  'Beschreiben Sie kurz was passiert ist (optional).',
  'z. B. „Auffahrunfall auf der A3, Heck stark beschädigt"',
  false,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"schadens_kurzbeschreibung"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'schaden'
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, optionen, db_target)
SELECT
  p.id, 40, 'fahrzeug_fahrbereit', 'segmented',
  'Ist Ihr Fahrzeug noch fahrbereit?',
  NULL,
  true,
  '[
    {"value":"true","label":"Ja, fahrbereit"},
    {"value":"false","label":"Nein, nicht fahrbereit"}
  ]'::jsonb,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"fahrzeug_fahrbereit"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'schaden'
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────
-- Felder — Phase 2: fahrzeug
-- ────────────────────────────────────────────────
INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, optionen, db_target)
SELECT
  p.id, 10, 'fahrzeugtyp', 'toggle-cards',
  'Fahrzeugtyp',
  NULL,
  true,
  '[
    {"value":"pkw","label":"PKW","icon":"car"},
    {"value":"motorrad","label":"Motorrad","icon":"motorcycle"},
    {"value":"transporter","label":"Transporter","icon":"van"},
    {"value":"lkw","label":"LKW","icon":"truck"},
    {"value":"wohnmobil","label":"Wohnmobil","icon":"rv"}
  ]'::jsonb,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"fahrzeugtyp"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'fahrzeug'
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, db_target)
SELECT
  p.id, 20, 'fahrzeug_hersteller', 'text',
  'Hersteller',
  NULL,
  'z. B. VW, BMW, Mercedes',
  true,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"fahrzeug_hersteller"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'fahrzeug'
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, db_target)
SELECT
  p.id, 30, 'fahrzeug_modell', 'text',
  'Modell',
  NULL,
  'z. B. Golf, 3er, C-Klasse',
  true,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"fahrzeug_modell"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'fahrzeug'
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, db_target)
SELECT
  p.id, 40, 'fahrzeug_baujahr', 'number',
  'Baujahr',
  NULL,
  'z. B. 2019',
  false,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"fahrzeug_baujahr"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'fahrzeug'
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────
-- Felder — Phase 3: termin
-- ────────────────────────────────────────────────
INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, optionen, db_target)
SELECT
  p.id, 10, 'wunschtermin_wann', 'segmented',
  'Wie dringend brauchen Sie den Termin?',
  NULL,
  true,
  '[
    {"value":"sofort","label":"Sofort (heute)"},
    {"value":"heute","label":"Morgen"},
    {"value":"tage","label":"In den nächsten Tagen"}
  ]'::jsonb,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"wunschtermin_wann"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'termin'
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, db_target)
SELECT
  p.id, 20, 'wunschtermin', 'slot',
  'Freien Termin wählen',
  'Alle angezeigten Zeiten sind beim gewählten Sachverständigen noch verfügbar.',
  true,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"wunschtermin"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'termin'
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────
-- Felder — Phase 4: kontakt
-- ────────────────────────────────────────────────
INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, db_target)
SELECT
  p.id, 10, 'vorname', 'text',
  'Vorname',
  NULL, 'Max',
  true,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"vorname"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'kontakt'
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, db_target)
SELECT
  p.id, 20, 'nachname', 'text',
  'Nachname',
  NULL, 'Mustermann',
  true,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"nachname"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'kontakt'
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, validation, db_target)
SELECT
  p.id, 30, 'telefon', 'tel',
  'Telefonnummer',
  'Für Terminbestätigung und Rückfragen.',
  '+49 151 12345678',
  true,
  '{"pattern":"^[+][0-9]{7,15}$","message":"Bitte gültige Telefonnummer eingeben"}'::jsonb,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"telefon"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'kontakt'
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, db_target)
SELECT
  p.id, 40, 'email', 'email',
  'E-Mail-Adresse',
  'Für Auftragsbestätigung und Gutachten-Zustellung.',
  'max@beispiel.de',
  true,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"email"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'kontakt'
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, optionen, db_target)
SELECT
  p.id, 50, 'bevorzugter_kanal', 'segmented',
  'Wie möchten Sie kontaktiert werden?',
  NULL,
  true,
  '[
    {"value":"whatsapp","label":"WhatsApp"},
    {"value":"anruf","label":"Anruf"},
    {"value":"email","label":"E-Mail"}
  ]'::jsonb,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"bevorzugter_kanal"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'kontakt'
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────
-- Felder — Phase 5: abschluss
-- ────────────────────────────────────────────────
INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, db_target)
SELECT
  p.id, 10, 'dsgvo_zustimmung', 'checkbox',
  'Ich stimme der Verarbeitung meiner Daten gemäß der Datenschutzerklärung zu.',
  'Ihre Daten werden ausschließlich zur Terminvermittlung genutzt und nicht an Dritte weitergegeben.',
  true,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"dsgvo_zustimmung_am"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'abschluss'
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, db_target)
SELECT
  p.id, 20, 'unterschrift', 'signature',
  'Ihre Unterschrift',
  'Mit Ihrer Unterschrift bestätigen Sie die Angaben und beauftragen die Terminvermittlung.',
  true,
  '{"tabelle":"gutachter_finder_anfragen","spalte":"unterschrift_data_url"}'::jsonb
FROM onboarding_phasen p
WHERE p.flow_key = 'gutachter-finden' AND p.phase_key = 'abschluss'
ON CONFLICT DO NOTHING;
