-- AAR-zb1-wizard: fahrzeug-Phase als Step 1 in 'kunde-onboarding' Flow.
-- Existierende Phasen haben reihenfolge in 10er-Schritten (10/20/30/40),
-- explizit für Einfügungen. fahrzeug bekommt reihenfolge=5 und steht
-- damit vor allen bestehenden Phasen, ohne dass etwas verschoben werden
-- muss.
--
-- Zusätzlich: kanal-CHECK auf dokument_upload_anfragen erweitert um
-- 'onboarding-wizard', damit ensureZb1Anfrage Pending-Rows mit
-- nachvollziehbarem Source-Marker anlegen kann.

BEGIN;

-- ─── 1. kanal-Constraint erweitern ───────────────────────────────────
ALTER TABLE dokument_upload_anfragen
  DROP CONSTRAINT IF EXISTS dokument_upload_anfragen_kanal_check;

ALTER TABLE dokument_upload_anfragen
  ADD CONSTRAINT dokument_upload_anfragen_kanal_check
  CHECK (kanal = ANY (ARRAY['whatsapp'::text, 'sms'::text, 'email'::text, 'onboarding-wizard'::text]));

-- ─── 2. typ-Constraint auf onboarding_felder erweitern ───────────────
-- 'zb1-upload' ist der neue Field-Typ für kamera-basierten ZB1-Upload
-- mit OCR (siehe Zb1UploadField.tsx).
ALTER TABLE onboarding_felder
  DROP CONSTRAINT IF EXISTS onboarding_felder_typ_check;

ALTER TABLE onboarding_felder
  ADD CONSTRAINT onboarding_felder_typ_check
  CHECK (typ = ANY (ARRAY[
    'text'::text, 'email'::text, 'tel'::text, 'number'::text,
    'textarea'::text, 'segmented'::text, 'toggle-cards'::text,
    'select'::text, 'slot'::text, 'signature'::text, 'file'::text,
    'checkbox'::text, 'zb1-upload'::text
  ]));

-- ─── 3. Neue fahrzeug-Phase auf reihenfolge=5 ────────────────────────
INSERT INTO onboarding_phasen (flow_key, phase_key, reihenfolge, titel, eyebrow, beschreibung)
VALUES (
  'kunde-onboarding',
  'fahrzeug',
  5,
  'Ihr Fahrzeug',
  'Schritt 1',
  'Fotografieren Sie den Fahrzeugschein — wir lesen Kennzeichen, Hersteller und Halter automatisch aus.'
);

-- ─── 4. Feld fahrzeugschein_foto einhängen ───────────────────────────
-- db_target.spalte = 'kennzeichen' → ladeNoetigePhasen skippt die Phase
-- sobald leads.kennzeichen befüllt ist (egal ob durch OCR oder Dispatcher).
INSERT INTO onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, db_target)
SELECT
  id,
  1,
  'fahrzeugschein_foto',
  'zb1-upload',
  'Fahrzeugschein',
  'Vorderseite des Fahrzeugscheins fotografieren — wir extrahieren die Daten automatisch.',
  true,
  jsonb_build_object('tabelle', 'leads', 'spalte', 'kennzeichen')
FROM onboarding_phasen
WHERE flow_key = 'kunde-onboarding' AND phase_key = 'fahrzeug';

COMMIT;
