-- AAR-515 Welle 1: Gutachter-Verifizierung v4.1 — DB-Fundament
--
-- Notion-SoT: https://www.notion.so/3461da4c91248159a1d1c2d6beef129e
--
-- 1. Drei neue Nummern-Spalten auf sachverstaendige (optional, kein NOT NULL)
-- 2. Zwei neue Mapping-Spalten auf dokument_katalog:
--    - maps_to_qualifikation → verbindet Slot ↔ Eintrag aus QUALIFIKATIONEN
--      (constants.ts: 8 Werte + Spezialfall 'dat-gutachter' via gutachter_typ)
--    - steuert_kundensichtbarkeit → true für die 4 verifizierungspflichtigen
--      Slots (BVSK, IHK, öbuv, DAT). Default false — Haftpflicht/Gewerbe
--      sind Tier 2 pflicht aber steuern keine externe Quali-Sichtbarkeit.
-- 3. Tier-Shift via pflicht_wenn-Update:
--    - sv_bvsk_mitgliedschaft: Tier 3 optional → Tier 2 conditional (wenn SV
--      die Quali „BVSK-Mitglied" ausgewählt hat)
--    - sv_dat_nachweis: neuer Tier-2-Conditional-Slot
--      (wird erst angelegt — existiert bisher nicht im Katalog)
--    - sv_bestellungsurkunde_oebuv: bereits Tier 2 conditional, nur Mapping ergänzen
--    - sv_ihk_zertifikat: komplett neuer Slot (Tier 2 conditional)
-- 4. Helper-Funktion get_sichtbare_qualifikationen(sv_id) liefert die
--    Whitelist für Rendering-Layer (Gate aktiv in Kunden-Kommunikation).

-- ─── 1. Nummern-Spalten ───────────────────────────────────────────────

ALTER TABLE public.sachverstaendige
  ADD COLUMN IF NOT EXISTS bvsk_mitgliedsnummer TEXT,
  ADD COLUMN IF NOT EXISTS ihk_zertifikat_nummer TEXT,
  ADD COLUMN IF NOT EXISTS oebuv_bestellungsnummer TEXT;

COMMENT ON COLUMN public.sachverstaendige.bvsk_mitgliedsnummer IS
  'AAR-515: BVSK-Mitgliedsnummer (optional). Wird beim Wizard erfasst '
  'wenn Quali „BVSK-Mitglied" gewählt, plausibilisiert vom Admin bei '
  'Tier-2-Freigabe von sv_bvsk_mitgliedschaft.';
COMMENT ON COLUMN public.sachverstaendige.ihk_zertifikat_nummer IS
  'AAR-515: IHK-Zertifikats-Nummer (optional). Erfassung + Plausibilisierung '
  'analog zu BVSK — Slot sv_ihk_zertifikat ist neu in v4.1.';
COMMENT ON COLUMN public.sachverstaendige.oebuv_bestellungsnummer IS
  'AAR-515: Bestellungsnummer ö.b.u.v. (optional). Für „Öffentlich bestellt '
  'und vereidigt"-Qualifikation — Plausibilisierung beim Tier-2-Freigabe '
  'des Slots sv_bestellungsurkunde_oebuv.';

-- ─── 2. Katalog-Mapping-Spalten ───────────────────────────────────────

ALTER TABLE public.dokument_katalog
  ADD COLUMN IF NOT EXISTS maps_to_qualifikation TEXT,
  ADD COLUMN IF NOT EXISTS steuert_kundensichtbarkeit BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.dokument_katalog.maps_to_qualifikation IS
  'AAR-515: Wert aus QUALIFIKATIONEN-Array (constants.ts) oder '
  'Spezial-String „dat-gutachter" für den DAT-Fall (gutachter_typ). '
  'Verbindet einen Upload-Slot mit einer externen Qualifikation — '
  'wird von get_sichtbare_qualifikationen() als Join-Kriterium genutzt.';
COMMENT ON COLUMN public.dokument_katalog.steuert_kundensichtbarkeit IS
  'AAR-515: true wenn die Freigabe des Slots eine Qualifikation in '
  'Kundenkommunikation (Flow-Link, /kunde/*, Email, WhatsApp, SEO) '
  'freischaltet. Default false — Haftpflicht/Gewerbe sind Tier-2-Pflicht '
  'aber nicht extern-sichtbar-relevant.';

-- ─── 3. Tier-Shift + IHK-Slot ─────────────────────────────────────────

-- 3a. BVSK-Mitgliedschaft: Tier 3 → Tier 2 conditional
--     Alte pflicht_wenn: {} (leer = immer, aber Slot war in Tier 3 gar nicht
--     Pflicht). Neue Regel: truthy auf sv_qualifikation_bvsk (= Quali im
--     qualifikationen_neu-Array enthalten — wird von App-Layer gesetzt).
UPDATE public.dokument_katalog
  SET pflicht_wenn = jsonb_build_object('op', 'truthy', 'field', 'sv_qualifikation_bvsk'),
      maps_to_qualifikation = 'BVSK-Mitglied',
      steuert_kundensichtbarkeit = true
  WHERE slot_id = 'sv_bvsk_mitgliedschaft';

-- 3b. öbuv-Bestellungsurkunde: Mapping ergänzen (Tier bleibt).
--     Bestehendes pflicht_wenn = { sv_qualifikation_oebuv: true } bleibt
--     als Legacy-Shortform. App-Layer normalisiert das auf die neue
--     truthy-Form.
UPDATE public.dokument_katalog
  SET maps_to_qualifikation = 'Öffentlich bestellt und vereidigt',
      steuert_kundensichtbarkeit = true
  WHERE slot_id = 'sv_bestellungsurkunde_oebuv';

-- 3c. DAT-Nachweis anlegen (neuer Slot — existierte bisher nicht im Katalog)
INSERT INTO public.dokument_katalog (
  slot_id, label, beschreibung, kategorie,
  freigeschaltet_wenn, pflicht_wenn,
  sichtbar_fuer, anforderbar_von, uploadbar_von,
  multi_file, akzeptierte_mime_types, max_mb, sort_order, aktiv,
  maps_to_qualifikation, steuert_kundensichtbarkeit
) VALUES (
  'sv_dat_nachweis',
  'DAT-Expert-Nachweis',
  'Nachweis der DAT-Expert-Zulassung (nur für Gutachter mit gutachter_typ=dat-gutachter).',
  'gutachter_verifizierung',
  jsonb_build_object('op', 'eq', 'field', 'sv_gutachter_typ', 'value', 'dat-gutachter'),
  jsonb_build_object('op', 'eq', 'field', 'sv_gutachter_typ', 'value', 'dat-gutachter'),
  ARRAY['admin', 'sachverstaendiger']::text[],
  ARRAY['admin']::text[],
  ARRAY['sachverstaendiger']::text[],
  false,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[],
  10,
  250,
  true,
  'dat-gutachter',
  true
)
ON CONFLICT (slot_id) DO UPDATE SET
  pflicht_wenn = EXCLUDED.pflicht_wenn,
  maps_to_qualifikation = EXCLUDED.maps_to_qualifikation,
  steuert_kundensichtbarkeit = EXCLUDED.steuert_kundensichtbarkeit,
  kategorie = EXCLUDED.kategorie;

-- 3d. IHK-Zertifikat (komplett neuer Slot)
INSERT INTO public.dokument_katalog (
  slot_id, label, beschreibung, kategorie,
  freigeschaltet_wenn, pflicht_wenn,
  sichtbar_fuer, anforderbar_von, uploadbar_von,
  multi_file, akzeptierte_mime_types, max_mb, sort_order, aktiv,
  maps_to_qualifikation, steuert_kundensichtbarkeit
) VALUES (
  'sv_ihk_zertifikat',
  'IHK-Zertifikat',
  'Nachweis der IHK-Zertifizierung als Sachverständiger (wenn Qualifikation „IHK-zertifiziert" gewählt).',
  'gutachter_verifizierung',
  jsonb_build_object('op', 'truthy', 'field', 'sv_qualifikation_ihk'),
  jsonb_build_object('op', 'truthy', 'field', 'sv_qualifikation_ihk'),
  ARRAY['admin', 'sachverstaendiger']::text[],
  ARRAY['admin']::text[],
  ARRAY['sachverstaendiger']::text[],
  false,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[],
  10,
  260,
  true,
  'IHK-zertifiziert',
  true
)
ON CONFLICT (slot_id) DO UPDATE SET
  pflicht_wenn = EXCLUDED.pflicht_wenn,
  maps_to_qualifikation = EXCLUDED.maps_to_qualifikation,
  steuert_kundensichtbarkeit = EXCLUDED.steuert_kundensichtbarkeit,
  label = EXCLUDED.label,
  kategorie = EXCLUDED.kategorie;

-- ─── 4. Helper-Funktion get_sichtbare_qualifikationen ─────────────────

-- Whitelist für Rendering-Layer. Liefert:
--   - Gruppe A (Selbstauskunft): 5 Einträge aus QUALIFIKATIONEN immer wenn
--     in qualifikationen_neu enthalten
--   - Gruppe B (Verifiziert): Einträge nur wenn ein zugehöriger Slot mit
--     steuert_kundensichtbarkeit=true den Status 'geprueft' hat
CREATE OR REPLACE FUNCTION public.get_sichtbare_qualifikationen(p_sv_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH sv_data AS (
    SELECT qualifikationen_neu, gutachter_typ
    FROM public.sachverstaendige
    WHERE id = p_sv_id
  ),
  -- Gruppe A: Selbstauskunft — wenn im qualifikationen_neu-Array
  selbstauskunft AS (
    SELECT q AS quali
    FROM sv_data, unnest(COALESCE(qualifikationen_neu, ARRAY[]::text[])) AS q
    WHERE q IN (
      'Karosseriebaumeister', 'Kfz-Meister', 'B.Eng.', 'M.Eng.', 'Dipl.-Ing.'
    )
  ),
  -- Gruppe B: Verifiziert — Slot mit steuert_kundensichtbarkeit=true ist 'geprueft'
  verifiziert AS (
    SELECT dk.maps_to_qualifikation AS quali
    FROM public.pflichtdokumente pd
    JOIN public.dokument_katalog dk ON dk.slot_id = pd.dokument_typ
    WHERE pd.sv_id = p_sv_id
      AND pd.status = 'geprueft'
      AND dk.steuert_kundensichtbarkeit = true
      AND dk.maps_to_qualifikation IS NOT NULL
      AND dk.maps_to_qualifikation != 'dat-gutachter'
  )
  SELECT COALESCE(
    ARRAY_AGG(DISTINCT quali ORDER BY quali) FILTER (WHERE quali IS NOT NULL),
    ARRAY[]::text[]
  )
  FROM (
    SELECT quali FROM selbstauskunft
    UNION
    SELECT quali FROM verifiziert
  ) qualis;
$$;

COMMENT ON FUNCTION public.get_sichtbare_qualifikationen(UUID) IS
  'AAR-515: Whitelist der Qualifikationen die in Kundenkommunikation '
  'angezeigt werden dürfen. Selbstauskunft (akad. Titel + Meisterbriefe) '
  'immer, verifizierte Qualis nur mit geprüftem Nachweis-Slot. DAT-Badge '
  'ist Sonderfall — gutachter_typ=dat-gutachter + sv_dat_nachweis-Prüfung, '
  'im App-Layer separat gechecked (nicht in diesem Array).';

-- Zugriff: authenticated + service_role. anon nicht, da SV-IDs sonst
-- öffentlich rückwärts enumerierbar wären (minimal Info aber trotzdem).
GRANT EXECUTE ON FUNCTION public.get_sichtbare_qualifikationen(UUID)
  TO authenticated, service_role;

-- ─── 5. Helper-Funktion is_dat_badge_sichtbar ─────────────────────────

-- DAT-Sonderfall: gutachter_typ='dat-gutachter' + sv_dat_nachweis 'geprueft'.
-- Separat weil gutachter_typ kein Element von qualifikationen_neu ist.
CREATE OR REPLACE FUNCTION public.is_dat_badge_sichtbar(p_sv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sachverstaendige sv
    WHERE sv.id = p_sv_id
      AND sv.gutachter_typ = 'dat-gutachter'
      AND EXISTS (
        SELECT 1 FROM public.pflichtdokumente pd
        WHERE pd.sv_id = sv.id
          AND pd.dokument_typ = 'sv_dat_nachweis'
          AND pd.status = 'geprueft'
      )
  );
$$;

COMMENT ON FUNCTION public.is_dat_badge_sichtbar(UUID) IS
  'AAR-515: DAT-Badge-Gate für Kundenkommunikation. True wenn SV als '
  'dat-gutachter angelegt UND sv_dat_nachweis-Slot geprüft.';

GRANT EXECUTE ON FUNCTION public.is_dat_badge_sichtbar(UUID)
  TO authenticated, service_role;
