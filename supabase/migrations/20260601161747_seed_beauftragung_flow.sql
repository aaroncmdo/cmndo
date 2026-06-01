-- P1b/2 (Gutachter-Finder->Self-Service): Seed flow_key='beauftragung' fuer den
-- DynamicWizard. 4 Phasen: service -> kanzlei(conditional) -> schuldfrage(Gate) -> sa.
-- db_target = leads (Beauftragung baut den Lead Feld-fuer-Feld vollstaendig).
-- service/kanzlei werden aus gutachter-finden kopiert (i18n-Paritaet), db_target
-- auf leads umgebogen; schuldfrage/sa sind net-new inkl. i18n (ar/en/pl/ru/tr).
-- Idempotent (Replay-safe): bestehende beauftragung-Config zuerst entfernen.

DELETE FROM onboarding_felder f
  USING onboarding_phasen p
  WHERE f.phase_id = p.id AND p.flow_key = 'beauftragung';
DELETE FROM onboarding_phasen WHERE flow_key = 'beauftragung';

-- 1) Phasen service + kanzlei aus gutachter-finden kopieren (reihenfolge neu).
INSERT INTO onboarding_phasen (flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung, conditional_on, i18n)
SELECT 'beauftragung',
       CASE phase_key WHEN 'service' THEN 10 WHEN 'kanzlei' THEN 20 END,
       phase_key, titel, eyebrow, beschreibung, conditional_on, i18n
FROM onboarding_phasen
WHERE flow_key = 'gutachter-finden' AND phase_key IN ('service', 'kanzlei');

-- 2) Phasen schuldfrage + sa (net-new).
INSERT INTO onboarding_phasen (flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung, conditional_on, i18n)
VALUES
  ('beauftragung', 30, 'schuldfrage', 'Wer hat den Unfall verursacht?', NULL,
   'Das entscheidet, ob die Kosten über die gegnerische Haftpflicht laufen.', NULL,
   jsonb_build_object(
     'ar', jsonb_build_object('titel', 'من تسبب في الحادث؟', 'beschreibung', 'هذا يحدد ما إذا كانت التكاليف ستُغطى من خلال تأمين الطرف الآخر.'),
     'en', jsonb_build_object('titel', 'Who caused the accident?', 'beschreibung', 'This determines whether the costs are covered by the other party''s liability insurance.'),
     'pl', jsonb_build_object('titel', 'Kto spowodował wypadek?', 'beschreibung', 'To decyduje, czy koszty pokryje ubezpieczenie OC strony przeciwnej.'),
     'ru', jsonb_build_object('titel', 'Кто стал виновником ДТП?', 'beschreibung', 'От этого зависит, покроет ли расходы страховка другой стороны.'),
     'tr', jsonb_build_object('titel', 'Kazaya kim sebep oldu?', 'beschreibung', 'Bu, masrafların karşı tarafın trafik sigortasından karşılanıp karşılanmayacağını belirler.')
   )),
  ('beauftragung', 40, 'sa', 'Auftrag & Vollmacht', NULL,
   'Mit Ihrer Unterschrift beauftragen Sie den Sachverständigen verbindlich — bei unverschuldetem Unfall kostenfrei für Sie.', NULL,
   jsonb_build_object(
     'ar', jsonb_build_object('titel', 'التكليف والتوكيل', 'beschreibung', 'بتوقيعك تكلّف الخبير بشكل ملزم — مجانًا لك في حادث لست مسؤولاً عنه.'),
     'en', jsonb_build_object('titel', 'Engagement & power of attorney', 'beschreibung', 'With your signature you bindingly commission the assessor — free of charge for you in a non-fault accident.'),
     'pl', jsonb_build_object('titel', 'Zlecenie i pełnomocnictwo', 'beschreibung', 'Podpisem zleca Pan/Pani wiążąco pracę rzeczoznawcy — bezpłatnie przy wypadku z winy drugiej strony.'),
     'ru', jsonb_build_object('titel', 'Поручение и доверенность', 'beschreibung', 'Своей подписью Вы официально поручаете работу эксперту — бесплатно для Вас при невиновном ДТП.'),
     'tr', jsonb_build_object('titel', 'Görevlendirme ve vekâletname', 'beschreibung', 'İmzanızla bilirkişiyi bağlayıcı olarak görevlendirirsiniz — kusursuz kazada sizin için ücretsiz.')
   ));

-- 3) Felder service_typ + kanzlei_wunsch aus gutachter-finden kopieren,
--    db_target auf leads umbiegen (service_typ -> leads.service_typ;
--    kanzlei_wunsch -> leads.kanzlei_wunsch). i18n/optionen/conditional_on bleiben.
INSERT INTO onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, optionen, validation, db_target, conditional_on, i18n)
SELECT bp.id, f.reihenfolge, f.feld_key, f.typ, f.label, f.hint, f.placeholder, f.pflicht, f.optionen, f.validation,
       jsonb_build_object('tabelle', 'leads', 'spalte',
         CASE f.feld_key WHEN 'service_typ' THEN 'service_typ' WHEN 'kanzlei_wunsch' THEN 'kanzlei_wunsch' END),
       f.conditional_on, f.i18n
FROM onboarding_felder f
JOIN onboarding_phasen gp ON gp.id = f.phase_id AND gp.flow_key = 'gutachter-finden'
JOIN onboarding_phasen bp ON bp.flow_key = 'beauftragung' AND bp.phase_key = gp.phase_key
WHERE gp.phase_key IN ('service', 'kanzlei') AND f.feld_key IN ('service_typ', 'kanzlei_wunsch');

-- 4) Felder schuldfrage (segmented, Gate) + unterschrift (signature -> Finalize-Sentinel '_finalize').
INSERT INTO onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, optionen, validation, db_target, conditional_on, i18n)
VALUES
  ((SELECT id FROM onboarding_phasen WHERE flow_key = 'beauftragung' AND phase_key = 'schuldfrage'),
   10, 'schuldfrage', 'segmented', 'Schuldfrage', NULL, NULL, true,
   '[{"value":"gegner","label":"Die Gegenseite"},{"value":"unklar","label":"Noch unklar"},{"value":"eigenverantwortung","label":"Ich selbst"}]'::jsonb,
   NULL,
   '{"tabelle":"leads","spalte":"schuldfrage"}'::jsonb,
   NULL,
   jsonb_build_object(
     'ar', jsonb_build_object('label', 'مسألة الذنب', 'optionen', jsonb_build_object('gegner', jsonb_build_object('label', 'الطرف الآخر'), 'unklar', jsonb_build_object('label', 'غير واضح بعد'), 'eigenverantwortung', jsonb_build_object('label', 'أنا نفسي'))),
     'en', jsonb_build_object('label', 'Fault', 'optionen', jsonb_build_object('gegner', jsonb_build_object('label', 'The other party'), 'unklar', jsonb_build_object('label', 'Still unclear'), 'eigenverantwortung', jsonb_build_object('label', 'Myself'))),
     'pl', jsonb_build_object('label', 'Wina', 'optionen', jsonb_build_object('gegner', jsonb_build_object('label', 'Strona przeciwna'), 'unklar', jsonb_build_object('label', 'Jeszcze niejasne'), 'eigenverantwortung', jsonb_build_object('label', 'Ja sam/sama'))),
     'ru', jsonb_build_object('label', 'Виновность', 'optionen', jsonb_build_object('gegner', jsonb_build_object('label', 'Другая сторона'), 'unklar', jsonb_build_object('label', 'Пока неясно'), 'eigenverantwortung', jsonb_build_object('label', 'Я сам'))),
     'tr', jsonb_build_object('label', 'Kusur durumu', 'optionen', jsonb_build_object('gegner', jsonb_build_object('label', 'Karşı taraf'), 'unklar', jsonb_build_object('label', 'Henüz belirsiz'), 'eigenverantwortung', jsonb_build_object('label', 'Kendim')))
   )),
  ((SELECT id FROM onboarding_phasen WHERE flow_key = 'beauftragung' AND phase_key = 'sa'),
   10, 'unterschrift', 'signature', 'Ihre Unterschrift', 'Unterschreiben Sie mit dem Finger oder der Maus.', NULL, true,
   NULL,
   NULL,
   '{"tabelle":"_finalize","spalte":"unterschrift"}'::jsonb,
   NULL,
   jsonb_build_object(
     'ar', jsonb_build_object('label', 'توقيعك', 'hint', 'وقّع بإصبعك أو بالفأرة.'),
     'en', jsonb_build_object('label', 'Your signature', 'hint', 'Sign with your finger or mouse.'),
     'pl', jsonb_build_object('label', 'Pana/Pani podpis', 'hint', 'Proszę podpisać palcem lub myszą.'),
     'ru', jsonb_build_object('label', 'Ваша подпись', 'hint', 'Распишитесь пальцем или мышью.'),
     'tr', jsonb_build_object('label', 'İmzanız', 'hint', 'Parmağınızla veya fareyle imzalayın.')
   ));
