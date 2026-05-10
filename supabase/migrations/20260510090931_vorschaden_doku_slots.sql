-- Vorschaden-Dokumentations-Pipeline (Aaron-Briefing 10.05.2026):
--
-- Wenn CarDentity-Typ-A oder Typ-B einen Vorschaden meldet, brauchen wir
-- vom Kunden zusätzlich zu den bereits existierenden Slots
-- (reparaturrechnung_vorschaden, vorschaden_bericht, kaufvertrag) noch:
--   1) Fotos des Altschadens (neuer Slot)
--   2) Altes Gutachten falls vorhanden (neuer Slot)
--   3) Information ob Vorschaden mit der Versicherung abgerechnet wurde
--      (neues Feld auf claims, weil claim die SSoT ist und vehicles
--      ggf. mehrere Schäden hatte)

-- ─── 1. Neue Dokument-Slots ─────────────────────────────────────────────
INSERT INTO public.dokument_katalog (
  slot_id, label, beschreibung, kategorie,
  freigeschaltet_wenn, pflicht_wenn,
  sichtbar_fuer, anforderbar_von, uploadbar_von,
  multi_file, akzeptierte_mime_types, max_mb, sort_order, aktiv,
  maps_to_qualifikation, steuert_kundensichtbarkeit
) VALUES
  (
    'altschaden_fotos',
    'Fotos des Vorschadens',
    'Fotos eines früheren Schadens am gleichen Fahrzeug — wichtig damit der Gutachter den aktuellen Schaden sauber vom Vorschaden abgrenzen kann. Falls keine Fotos verfügbar: einfach „später nachreichen" anklicken.',
    'fahrzeug',
    -- freigeschaltet wenn CarDentity Vorschaden gemeldet hat ODER User
    -- hat selbst Vorschaden angegeben
    '{"any_of": [{"field": "vorschaden_check_status", "equals": "vorschaden_erkannt"}, {"field": "hat_vorschaeden", "equals": true}]}'::jsonb,
    -- nicht hart Pflicht — Kunde hat Fotos eventuell nicht mehr
    '{}'::jsonb,
    ARRAY['admin', 'dispatch', 'kundenbetreuer', 'sachverstaendiger', 'kunde']::text[],
    ARRAY['admin', 'dispatch', 'kundenbetreuer']::text[],
    ARRAY['kunde', 'admin']::text[],
    true, -- mehrere Fotos möglich
    ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp']::text[],
    15,
    420, -- nach reparaturrechnung_vorschaden (~410)
    true,
    NULL,
    true
  ),
  (
    'altes_gutachten',
    'Altes Gutachten',
    'Falls für den Vorschaden bereits ein Gutachten erstellt wurde — der neue Sachverständige nutzt das als Abgrenzung. Beschleunigt die Begutachtung erheblich.',
    'fahrzeug',
    '{"any_of": [{"field": "vorschaden_check_status", "equals": "vorschaden_erkannt"}, {"field": "hat_vorschaeden", "equals": true}]}'::jsonb,
    '{}'::jsonb,
    ARRAY['admin', 'dispatch', 'kundenbetreuer', 'sachverstaendiger', 'kunde']::text[],
    ARRAY['admin', 'dispatch', 'kundenbetreuer']::text[],
    ARRAY['kunde', 'admin']::text[],
    false,
    ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[],
    25, -- Gutachten-PDFs können größer sein
    430,
    true,
    NULL,
    true
  )
ON CONFLICT (slot_id) DO NOTHING;

-- ─── 2. Neues Feld auf claims: Vorschaden-Abrechnungs-Status ─────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'claims'
      AND column_name = 'vorschaden_mit_vs_abgerechnet'
  ) THEN
    ALTER TABLE public.claims
      ADD COLUMN vorschaden_mit_vs_abgerechnet text
        CHECK (vorschaden_mit_vs_abgerechnet IN ('ja', 'nein', 'teilweise', 'unbekannt'));

    COMMENT ON COLUMN public.claims.vorschaden_mit_vs_abgerechnet IS
      'Wurde der Vorschaden mit der Versicherung abgerechnet? Beeinflusst die Rechtslage bei der aktuellen Schadensregulierung — wenn nicht abgerechnet, bleibt der Anspruch grundsätzlich bestehen, wird aber mit dem aktuellen Schaden verrechnet.';
  END IF;
END $$;
