-- AAR-359 Welle 1 (Seed): 5 Verifizierungs-Slots im dokument_katalog.
-- Voraussetzung: Migration 20260417j hat das Enum 'gutachter_verifizierung'
-- bereits eingeführt.
--
-- Design:
-- - uploadbar_von = ['sachverstaendiger'] — der SV lädt selbst hoch.
-- - sichtbar_fuer = ['sachverstaendiger','admin'] — nur SV + Admin sehen
--   SV-Verifizierungs-Dokumente. Kunde/SV-Kollege/Kanzlei nicht.
-- - anforderbar_von = ['admin'] — Admin kann nachfordern (via bestehende
--   pflichtdokumente-Anforderungs-Mechanik mit gutachter_id statt fall_id).
-- - freigeschaltet_wenn/pflicht_wenn: bewusst nur '{}' (immer) bzw. spezifisch
--   für bestellungsurkunde_oebuv. Die Tier-Logik (welche Docs vor SA-Freigabe
--   vs. Tier-2-14-Tage vs. optional) hängt später an Code-Konstanten, nicht
--   am Katalog — der Katalog liefert nur die Slot-Metadaten.

INSERT INTO dokument_katalog (
  slot_id, label, beschreibung, kategorie,
  freigeschaltet_wenn, pflicht_wenn,
  sichtbar_fuer, anforderbar_von, uploadbar_von,
  multi_file, akzeptierte_mime_types, max_mb, sort_order, aktiv
) VALUES
  -- ── Tier 1 ───────────────────────────────────────────────────────
  (
    'sv_sa_vorlage',
    'SA-Vorlage',
    'Schadenaufnahme-Vorlage / Gutachten-Muster-PDF. Wird im Willkommen-Flow hochgeladen und vom Admin freigegeben — blockiert den Dispatch-Start.',
    'gutachter_verifizierung'::dokument_kategorie,
    '{}'::jsonb, '{}'::jsonb,
    ARRAY['sachverstaendiger','admin'],
    ARRAY['admin'],
    ARRAY['sachverstaendiger'],
    false,
    ARRAY['application/pdf'],
    15, 10, true
  ),

  -- ── Tier 2 ───────────────────────────────────────────────────────
  (
    'sv_berufshaftpflicht',
    'Berufshaftpflicht-Nachweis',
    'Aktueller Versicherungsschein oder Bestätigung der Versicherung. Pflicht für alle SVs.',
    'gutachter_verifizierung'::dokument_kategorie,
    '{}'::jsonb, '{}'::jsonb,
    ARRAY['sachverstaendiger','admin'],
    ARRAY['admin'],
    ARRAY['sachverstaendiger'],
    false,
    ARRAY['application/pdf','image/jpeg','image/png'],
    10, 20, true
  ),
  (
    'sv_gewerbeanmeldung',
    'Gewerbeanmeldung',
    'Gewerbeanmeldung des SV. MVP: für alle SVs Pflicht — Freiberufler-Sonderfall kommt in einem Post-MVP-Ticket.',
    'gutachter_verifizierung'::dokument_kategorie,
    '{}'::jsonb, '{}'::jsonb,
    ARRAY['sachverstaendiger','admin'],
    ARRAY['admin'],
    ARRAY['sachverstaendiger'],
    false,
    ARRAY['application/pdf','image/jpeg','image/png'],
    10, 30, true
  ),
  (
    'sv_bestellungsurkunde_oebuv',
    'Bestellungsurkunde ö.b.u.v.',
    'Bestellungsurkunde als öffentlich bestellter und vereidigter Sachverständiger. Conditional Pflicht: nur wenn SV entsprechende Qualifikation in seinem Profil hinterlegt hat.',
    'gutachter_verifizierung'::dokument_kategorie,
    '{"sv_qualifikation_oebuv": true}'::jsonb,
    '{"sv_qualifikation_oebuv": true}'::jsonb,
    ARRAY['sachverstaendiger','admin'],
    ARRAY['admin'],
    ARRAY['sachverstaendiger'],
    false,
    ARRAY['application/pdf','image/jpeg','image/png'],
    10, 40, true
  ),

  -- ── Tier 3 ───────────────────────────────────────────────────────
  (
    'sv_bvsk_mitgliedschaft',
    'BVSK-Mitgliedschaft',
    'Optionaler Nachweis der BVSK-Mitgliedschaft. Verbessert die Vertrauens-Anzeige im SV-Profil — ist aber zu keinem Zeitpunkt Dispatch-Voraussetzung.',
    'gutachter_verifizierung'::dokument_kategorie,
    '{}'::jsonb, '{}'::jsonb,
    ARRAY['sachverstaendiger','admin'],
    ARRAY['admin'],
    ARRAY['sachverstaendiger'],
    false,
    ARRAY['application/pdf','image/jpeg','image/png'],
    10, 50, true
  )
ON CONFLICT (slot_id) DO UPDATE SET
  label = EXCLUDED.label,
  beschreibung = EXCLUDED.beschreibung,
  kategorie = EXCLUDED.kategorie,
  freigeschaltet_wenn = EXCLUDED.freigeschaltet_wenn,
  pflicht_wenn = EXCLUDED.pflicht_wenn,
  sichtbar_fuer = EXCLUDED.sichtbar_fuer,
  anforderbar_von = EXCLUDED.anforderbar_von,
  uploadbar_von = EXCLUDED.uploadbar_von,
  multi_file = EXCLUDED.multi_file,
  akzeptierte_mime_types = EXCLUDED.akzeptierte_mime_types,
  max_mb = EXCLUDED.max_mb,
  sort_order = EXCLUDED.sort_order,
  aktiv = EXCLUDED.aktiv,
  updated_at = now();
