-- AAR-714: SV-Onboarding Multi-Doc-Upload.
--
-- Der bisherige „SA-Vorlage"-Step (ein PDF) wird durch den neuen Step
-- „Dokumente hochladen" ersetzt, der drei Pflicht-Dokumente einsammelt:
--   1. Sicherungsabtretung ODER Honorarvereinbarung (eines von beiden)
--   2. Datenschutzerklärung (pflicht)
--   3. Widerrufsbelehrung (pflicht)
--
-- sv_sicherungsabtretung existiert bereits im dokument_katalog und wird
-- weiter genutzt. Diese Migration legt nur die drei neuen Slots an.
--
-- Kein Backfill: Im aktuellen Bestand gibt es keine SVs mit
-- sa_vorlage_storage_path IS NOT NULL (geprüft vor dem Schreiben der
-- Migration). Die alten sa_vorlage_*-Spalten auf sachverstaendige bleiben
-- bestehen und werden NICHT gedropt — separates Clean-up-Ticket, sobald
-- kein Code mehr darauf schreibt.

INSERT INTO public.dokument_katalog (
  slot_id,
  label,
  beschreibung,
  kategorie,
  sichtbar_fuer,
  anforderbar_von,
  uploadbar_von,
  akzeptierte_mime_types,
  max_mb,
  sort_order,
  aktiv,
  steuert_kundensichtbarkeit
) VALUES
  (
    'sv_honorarvereinbarung',
    'Honorarvereinbarung',
    'Alternativ zur Sicherungsabtretung. Eines von beiden ist Pflicht für die Freischaltung.',
    'gutachter_verifizierung',
    ARRAY['admin','sachverstaendiger'],
    ARRAY['admin'],
    ARRAY['sachverstaendiger','admin'],
    ARRAY['application/pdf','image/jpeg','image/png'],
    15,
    11,
    true,
    false
  ),
  (
    'sv_datenschutzerklaerung',
    'Datenschutzerklärung',
    'Datenschutzerklärung des Sachverständigenbüros für Endkunden.',
    'gutachter_verifizierung',
    ARRAY['admin','sachverstaendiger'],
    ARRAY['admin'],
    ARRAY['sachverstaendiger','admin'],
    ARRAY['application/pdf','image/jpeg','image/png'],
    15,
    12,
    true,
    false
  ),
  (
    'sv_widerrufsbelehrung',
    'Widerrufsbelehrung',
    'Widerrufsbelehrung für Endkunden nach §§ 312g, 355 BGB.',
    'gutachter_verifizierung',
    ARRAY['admin','sachverstaendiger'],
    ARRAY['admin'],
    ARRAY['sachverstaendiger','admin'],
    ARRAY['application/pdf','image/jpeg','image/png'],
    15,
    13,
    true,
    false
  )
ON CONFLICT (slot_id) DO NOTHING;

-- Bestehenden sv_sicherungsabtretung-Slot auf die neue sort_order ziehen,
-- damit die drei neuen Slots in der richtigen Reihenfolge angezeigt werden
-- (Sicherungsabtretung = 10, Honorar = 11, Datenschutz = 12, Widerruf = 13).
UPDATE public.dokument_katalog SET sort_order = 10 WHERE slot_id = 'sv_sicherungsabtretung';
