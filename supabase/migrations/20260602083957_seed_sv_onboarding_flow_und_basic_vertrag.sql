-- P2a Task 6: Seed sv-onboarding-Flow (Basic-Pfad) + Basic-Partnervertrag-Vorlage (DRAFT).
-- vertragsvorlagen_typ_check um 'sv_basic_partnervertrag' erweitern (eigene, vereinfachte
-- Vorlage fuer Basic — getrennt vom bezahlten 'kooperationsvertrag_muster').
ALTER TABLE public.vertragsvorlagen DROP CONSTRAINT IF EXISTS vertragsvorlagen_typ_check;
ALTER TABLE public.vertragsvorlagen ADD CONSTRAINT vertragsvorlagen_typ_check
  CHECK (typ = ANY (ARRAY['nutzungsbedingungen','kooperationsvertrag_muster','sa_kunde',
    'akademie_kooperation','community_kooperation','sv_basic_partnervertrag']));

-- Flow idempotent neu seeden.
DELETE FROM public.onboarding_felder f USING public.onboarding_phasen p
  WHERE f.phase_id = p.id AND p.flow_key = 'sv-onboarding';
DELETE FROM public.onboarding_phasen WHERE flow_key = 'sv-onboarding';

INSERT INTO public.onboarding_phasen (flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung) VALUES
  ('sv-onboarding', 10, 'identitaet', 'Telefon bestätigen', 'Schritt 1', 'Wir verifizieren deine Nummer für die Koordination der Termine.'),
  ('sv-onboarding', 20, 'standort',   'Dein Standort', 'Schritt 2', 'Deine Adresse und dein Einsatzgebiet.'),
  ('sv-onboarding', 30, 'profil',     'Dein Profil', 'Schritt 3', 'Ein Foto und eine kurze Beschreibung für deine Kunden.'),
  ('sv-onboarding', 40, 'kalender',   'Kalender verbinden', 'Schritt 4', 'Damit wir nur freie Termine vorschlagen.'),
  ('sv-onboarding', 50, 'vertrag',    'Vertrag & Datenschutz', 'Schritt 5', 'Kurz den Basic-Partnervertrag unterschreiben.');

INSERT INTO public.onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, db_target)
SELECT p.id, 10, 'phone_verified', 'phone-verify', 'Telefonnummer', 'Du bekommst einen Code per SMS.', true,
  '{"tabelle":"profiles","spalte":"twofa_telefon_verifiziert_am"}'::jsonb
FROM public.onboarding_phasen p WHERE p.flow_key='sv-onboarding' AND p.phase_key='identitaet';

INSERT INTO public.onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, placeholder, pflicht, db_target)
SELECT p.id, 10, 'standort_adresse', 'text', 'Adresse', 'Musterstraße 1, 42103 Wuppertal', true,
  '{"tabelle":"sachverstaendige","spalte":"standort_adresse"}'::jsonb
FROM public.onboarding_phasen p WHERE p.flow_key='sv-onboarding' AND p.phase_key='standort';

INSERT INTO public.onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, db_target)
SELECT p.id, 10, 'avatar_url', 'avatar-upload', 'Profilfoto', 'Optional, aber empfohlen.', false,
  '{"tabelle":"profiles","spalte":"avatar_url"}'::jsonb
FROM public.onboarding_phasen p WHERE p.flow_key='sv-onboarding' AND p.phase_key='profil';
INSERT INTO public.onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, placeholder, pflicht, db_target)
SELECT p.id, 20, 'profilbeschreibung', 'textarea', 'Kurzbeschreibung', 'Worauf bist du spezialisiert?', true,
  '{"tabelle":"profiles","spalte":"profilbeschreibung"}'::jsonb
FROM public.onboarding_phasen p WHERE p.flow_key='sv-onboarding' AND p.phase_key='profil';

INSERT INTO public.onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, db_target)
SELECT p.id, 10, 'kalender_connected', 'calendar-connect', 'Kalender', 'Google-Kalender oder CalDAV verbinden.', true,
  '{"tabelle":"_self","spalte":"kalender_connected"}'::jsonb
FROM public.onboarding_phasen p WHERE p.flow_key='sv-onboarding' AND p.phase_key='kalender';

INSERT INTO public.onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, pflicht, db_target)
SELECT p.id, 10, 'unterschrift', 'signature', 'Unterschrift', true,
  '{"tabelle":"_finalize","spalte":"unterschrift"}'::jsonb
FROM public.onboarding_phasen p WHERE p.flow_key='sv-onboarding' AND p.phase_key='vertrag';

-- Basic-Partnervertrag-Vorlage (DRAFT v1 — VOR GO-LIVE durch finale juristische Fassung ersetzen).
INSERT INTO public.vertragsvorlagen (typ, version, titel, inhalt_html, pflicht_unterschrift, aktiv)
SELECT 'sv_basic_partnervertrag', 'v1-draft', 'Claimondo Basic-Partnervertrag (Entwurf)',
  '<h1>Basic-Partnervertrag</h1><p><strong>Entwurf v1 — vor Go-Live durch die finale juristische Fassung zu ersetzen.</strong></p><p>Mit deiner Unterschrift wirst du kostenloser Basic-Partner von Claimondo. Es fallen keine Mitgliedsbeiträge an. Für jeden über Claimondo vermittelten und durchgeführten Auftrag wird ein Einzelpreis (30 % nach Schadenhöhe) berechnet; dein Honorar bleibt unberührt. Die Verarbeitung deiner Daten erfolgt gemäß DSGVO. Es besteht keine Exklusivität; der Vertrag ist jederzeit kündbar.</p>',
  true, true
WHERE NOT EXISTS (SELECT 1 FROM public.vertragsvorlagen WHERE typ='sv_basic_partnervertrag' AND aktiv=true);
