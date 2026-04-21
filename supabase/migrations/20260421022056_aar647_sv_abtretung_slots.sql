-- AAR-647: SV-Abtretungs-Slots in dokument_katalog + Pflicht-Upload-Infrastruktur.
--
-- Problem: Gutachter-Onboarding hat aktuell nur die SA-Vorlage als uploadbares
-- Dokument (sv_sa_vorlage). Admin-Report aus Support-Ticket AAR-647:
-- „Sachverständigenabtretungserklärung + Sicherungsabtretung triggert kein
-- Admin-Review-Task."
--
-- Lösung: Zwei neue Slots in dokument_katalog anlegen. Der generische
-- uploadSvPflichtdokument-Endpoint (Code-seitig) nutzt diese Slots und
-- triggert bei Upload einen Admin-Task + Mitteilung (analog uploadSaVorlage).
--
-- Bestehende Infrastruktur in pflichtdokumente.dokument_url + hochgeladen_am
-- reicht aus — keine Schema-Änderung an der Tabelle nötig.

INSERT INTO public.dokument_katalog (
  slot_id, label, beschreibung, kategorie,
  freigeschaltet_wenn, pflicht_wenn,
  sichtbar_fuer, anforderbar_von, uploadbar_von,
  multi_file, akzeptierte_mime_types, max_mb, sort_order, aktiv,
  maps_to_qualifikation, steuert_kundensichtbarkeit
) VALUES
  (
    'sv_abtretungserklaerung',
    'Sachverständigen-Abtretungserklärung',
    'Unterschriebene Abtretungserklärung zwischen Sachverständigem und Claimondo. Einmalig im Onboarding hochzuladen.',
    'gutachter_verifizierung',
    '{}'::jsonb,
    '{}'::jsonb,
    ARRAY['admin', 'sachverstaendiger']::text[],
    ARRAY['admin']::text[],
    ARRAY['sachverstaendiger']::text[],
    false,
    ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[],
    15,
    240,
    true,
    NULL,
    false
  ),
  (
    'sv_sicherungsabtretung',
    'Sicherungsabtretung',
    'Unterschriebene Sicherungsabtretung (Abtretung von Honorarforderungen). Einmalig im Onboarding hochzuladen.',
    'gutachter_verifizierung',
    '{}'::jsonb,
    '{}'::jsonb,
    ARRAY['admin', 'sachverstaendiger']::text[],
    ARRAY['admin']::text[],
    ARRAY['sachverstaendiger']::text[],
    false,
    ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[],
    15,
    245,
    true,
    NULL,
    false
  )
ON CONFLICT (slot_id) DO UPDATE SET
  label = EXCLUDED.label,
  beschreibung = EXCLUDED.beschreibung,
  kategorie = EXCLUDED.kategorie,
  uploadbar_von = EXCLUDED.uploadbar_von,
  akzeptierte_mime_types = EXCLUDED.akzeptierte_mime_types,
  aktiv = true;

COMMENT ON TABLE public.dokument_katalog IS
  'Einheitlicher Katalog aller Dokument-Slots (SV-Verifizierung + Fall-Dokumente). '
  'Upload-Endpoint siehe uploadSvPflichtdokument() für SV-seitige Pflicht-Uploads. '
  'Pro Slot mit aktiv=true + uploadbar_von[] = wer darf hochladen.';
