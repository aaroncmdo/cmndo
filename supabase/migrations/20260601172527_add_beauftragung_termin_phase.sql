-- P4 (Gutachter-Finder->Self-Service): Feld-Typ 'termin' + termin-Phase im
-- beauftragung-Flow (zwischen schuldfrage 30 und sa 40). Erst die typ-CHECK
-- erweitern, dann die Phase seeden (atomar). Feld typ='termin' (TerminField,
-- Consumer ladeMatching/bucheTermin -> gutachter_termine.lead_id). db_target
-- Sentinel '_termin' -> vom Lead-Save geskippt. Unconditional (Cluster-LP bucht
-- in-flow); Slot-Carry-Conditional = P5. Idempotent.

ALTER TABLE onboarding_felder DROP CONSTRAINT IF EXISTS onboarding_felder_typ_check;
ALTER TABLE onboarding_felder ADD CONSTRAINT onboarding_felder_typ_check
  CHECK (typ = ANY (ARRAY['text', 'email', 'tel', 'number', 'textarea', 'segmented', 'toggle-cards', 'select', 'slot', 'signature', 'file', 'checkbox', 'zb1-upload', 'termin']));

DELETE FROM onboarding_felder f USING onboarding_phasen p
  WHERE f.phase_id = p.id AND p.flow_key = 'beauftragung' AND p.phase_key = 'termin';
DELETE FROM onboarding_phasen WHERE flow_key = 'beauftragung' AND phase_key = 'termin';

INSERT INTO onboarding_phasen (flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung, conditional_on, i18n)
VALUES ('beauftragung', 35, 'termin', 'Ihr Gutachter-Termin', NULL,
  'Wählen Sie einen passenden Termin — der erste Vorschlag ist Ihr bestpassender Gutachter.', NULL,
  jsonb_build_object(
    'ar', jsonb_build_object('titel', 'موعد الخبير', 'beschreibung', 'اختر موعدًا مناسبًا — الاقتراح الأول هو الخبير الأنسب لك.'),
    'en', jsonb_build_object('titel', 'Your assessor appointment', 'beschreibung', 'Pick a suitable time — the first suggestion is your best-matching assessor.'),
    'pl', jsonb_build_object('titel', 'Termin u rzeczoznawcy', 'beschreibung', 'Proszę wybrać dogodny termin — pierwsza propozycja to najlepiej dopasowany rzeczoznawca.'),
    'ru', jsonb_build_object('titel', 'Приём у эксперта', 'beschreibung', 'Выберите удобное время — первое предложение это наиболее подходящий эксперт.'),
    'tr', jsonb_build_object('titel', 'Bilirkişi randevunuz', 'beschreibung', 'Uygun bir zaman seçin — ilk öneri size en uygun bilirkişidir.')
  ));

INSERT INTO onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, optionen, validation, db_target, conditional_on, i18n)
VALUES (
  (SELECT id FROM onboarding_phasen WHERE flow_key = 'beauftragung' AND phase_key = 'termin'),
  10, 'termin', 'termin', 'Termin', NULL, NULL, true,
  NULL, NULL,
  '{"tabelle":"_termin","spalte":"termin_id"}'::jsonb,
  NULL,
  jsonb_build_object(
    'ar', jsonb_build_object('label', 'الموعد'),
    'en', jsonb_build_object('label', 'Appointment'),
    'pl', jsonb_build_object('label', 'Termin'),
    'ru', jsonb_build_object('label', 'Запись'),
    'tr', jsonb_build_object('label', 'Randevu')
  )
);
