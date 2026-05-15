-- AAR Cluster F+G (Gutachten Sub-Table, 14.05.2026 PR-1)
-- Spec: docs/superpowers/specs/2026-05-14-cluster-fg-gutachten-subtable-design.md
--
-- Phase 1 (dieser PR): Schema + View + Dual-Write-Function aufbauen.
-- 38 Daten-Spalten von claims auf gutachten spiegeln (1:1 via UNIQUE),
-- View v_gutachten_werte mit COALESCE als Dual-Source-Reader, Function
-- apply_gutachten_ocr() schreibt atomic auf claims+gutachten.
--
-- Phase 2 (PR-2 nach Merge): 25 Reader auf View umstellen, claims-Spalten
-- droppen, Dual-Write aus Function entfernen.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- Task 2: 38 Daten-Spalten auf gutachten (30 Cluster F + 8 Cluster G)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.gutachten
  ADD COLUMN IF NOT EXISTS gutachten_datum                date,
  ADD COLUMN IF NOT EXISTS gutachten_ocr_processed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS gutachten_ocr_raw              jsonb,
  ADD COLUMN IF NOT EXISTS gutachten_ocr_error            text,
  ADD COLUMN IF NOT EXISTS gutachten_ocr_manuell_ueberschrieben boolean NOT NULL DEFAULT false,
  -- Cluster F.A — Fahrzeug-Stammdaten aus PDF
  ADD COLUMN IF NOT EXISTS gutachten_fin                  text,
  ADD COLUMN IF NOT EXISTS gutachten_kennzeichen          text,
  ADD COLUMN IF NOT EXISTS gutachten_erstzulassung        date,
  ADD COLUMN IF NOT EXISTS gutachten_laufleistung_km      integer,
  ADD COLUMN IF NOT EXISTS gutachten_tuv_bis              date,
  ADD COLUMN IF NOT EXISTS gutachten_fahrzeug_typ         text,
  ADD COLUMN IF NOT EXISTS gutachten_farbe                text,
  ADD COLUMN IF NOT EXISTS gutachten_farbcode             text,
  ADD COLUMN IF NOT EXISTS gutachten_kraftstoff           text,
  -- Cluster F.B — Vorschäden + Zustand
  ADD COLUMN IF NOT EXISTS gutachten_vorschaeden_text     text,
  ADD COLUMN IF NOT EXISTS gutachten_lackmesswert_max_my  numeric(6, 1),
  ADD COLUMN IF NOT EXISTS gutachten_karosseriezustand    text,
  -- Cluster F.C — Reparatur-Detail
  ADD COLUMN IF NOT EXISTS gutachten_zeit_ak_std          numeric(6, 2),
  ADD COLUMN IF NOT EXISTS gutachten_zeit_kar_std         numeric(6, 2),
  ADD COLUMN IF NOT EXISTS gutachten_zeit_lack_std        numeric(6, 2),
  ADD COLUMN IF NOT EXISTS gutachten_lohnsatz_ak_eur      numeric(8, 2),
  ADD COLUMN IF NOT EXISTS gutachten_lohnsatz_kar_eur     numeric(8, 2),
  ADD COLUMN IF NOT EXISTS gutachten_lohnsatz_lack_eur    numeric(8, 2),
  ADD COLUMN IF NOT EXISTS gutachten_materialkosten_eur   numeric(10, 2),
  ADD COLUMN IF NOT EXISTS gutachten_lackmaterial_eur     numeric(10, 2),
  ADD COLUMN IF NOT EXISTS gutachten_verbringung_eur      numeric(10, 2),
  -- Cluster F.D — Mietwagen + Nutzungsausfall (Tagessätze)
  ADD COLUMN IF NOT EXISTS gutachten_mietwagen_klasse              text,
  ADD COLUMN IF NOT EXISTS gutachten_mietwagen_tagessatz_eur       numeric(8, 2),
  ADD COLUMN IF NOT EXISTS gutachten_nutzungsausfall_tagessatz_eur numeric(8, 2),
  -- Cluster F.E — SV-Metadaten
  ADD COLUMN IF NOT EXISTS gutachten_sv_honorar_netto     numeric(10, 2),
  ADD COLUMN IF NOT EXISTS gutachten_sv_honorar_brutto    numeric(10, 2),
  ADD COLUMN IF NOT EXISTS gutachten_kalkulationssystem   text,
  ADD COLUMN IF NOT EXISTS gutachten_seitenzahl           integer,
  -- ─────────────────────────────────────────────────────────────────
  -- Cluster G (8 Spalten): Wert-Output (Kunde-/SV-facing)
  -- ─────────────────────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS reparaturkosten_netto          numeric(10, 2),
  ADD COLUMN IF NOT EXISTS reparaturkosten_brutto         numeric(10, 2),
  ADD COLUMN IF NOT EXISTS minderwert                     numeric(10, 2),
  ADD COLUMN IF NOT EXISTS restwert                       numeric(10, 2),
  ADD COLUMN IF NOT EXISTS wiederbeschaffungswert         numeric(10, 2),
  ADD COLUMN IF NOT EXISTS wiederbeschaffungsdauer_tage   integer,
  ADD COLUMN IF NOT EXISTS nutzungsausfall_tage           integer,
  ADD COLUMN IF NOT EXISTS totalschaden                   boolean;

-- 3 CHECK-Constraints 1:1 von claims uebernommen
-- (Migration 20260502104809 hatte diese drei auf claims)
ALTER TABLE public.gutachten
  DROP CONSTRAINT IF EXISTS gutachten_karosseriezustand_check;
ALTER TABLE public.gutachten
  ADD CONSTRAINT gutachten_karosseriezustand_check CHECK (
    gutachten_karosseriezustand IS NULL
    OR gutachten_karosseriezustand IN ('makellos', 'gebrauchsspuren', 'unfallbeschaedigt', 'sonstiges')
  );

ALTER TABLE public.gutachten
  DROP CONSTRAINT IF EXISTS gutachten_kalkulationssystem_check;
ALTER TABLE public.gutachten
  ADD CONSTRAINT gutachten_kalkulationssystem_check CHECK (
    gutachten_kalkulationssystem IS NULL
    OR gutachten_kalkulationssystem IN ('audatex', 'dat', 'autoixpert', 'sonstiges')
  );

ALTER TABLE public.gutachten
  DROP CONSTRAINT IF EXISTS gutachten_kraftstoff_check;
ALTER TABLE public.gutachten
  ADD CONSTRAINT gutachten_kraftstoff_check CHECK (
    gutachten_kraftstoff IS NULL
    OR gutachten_kraftstoff IN ('benzin', 'diesel', 'hybrid', 'elektro', 'gas', 'sonstiges')
  );

-- ─────────────────────────────────────────────────────────────────────
-- Task 3: UNIQUE-Constraint auf gutachten.claim_id (1:1-Garantie)
-- ─────────────────────────────────────────────────────────────────────
-- 1:1-Garantie. gutachten heute: nur Index idx_gutachten_claim (Migration
-- 20260426140000 Zeile 42), kein UNIQUE. Brauchen wir fuer ON CONFLICT in
-- apply_gutachten_ocr. Drop des redundanten Index, weil UNIQUE implizit
-- einen Btree-Index erzeugt.
ALTER TABLE public.gutachten
  DROP CONSTRAINT IF EXISTS gutachten_claim_id_unique;
ALTER TABLE public.gutachten
  ADD CONSTRAINT gutachten_claim_id_unique UNIQUE (claim_id);

DROP INDEX IF EXISTS public.idx_gutachten_claim;

-- ─────────────────────────────────────────────────────────────────────
-- Task 4: Backfill bestehender OCR-Claims
-- ─────────────────────────────────────────────────────────────────────
-- Pre-Check: Wenn gutachten doch schon Daten haette mit mehr als 1 Row pro
-- claim_id, wuerde der UNIQUE-Constraint oben failen. Audit sagt 0 Rows;
-- dieser DO-Block macht das explizit (falls Audit veraltet).
DO $$
DECLARE v_dupe_count integer;
BEGIN
  SELECT count(*) INTO v_dupe_count FROM (
    SELECT claim_id FROM public.gutachten GROUP BY claim_id HAVING count(*) > 1
  ) sub;
  IF v_dupe_count > 0 THEN
    RAISE EXCEPTION 'gutachten hat % claim_id-Duplikate — Backfill abgebrochen', v_dupe_count;
  END IF;
END $$;

-- Fuer jeden Claim mit OCR-Output + zugeordnetem SV eine gutachten-Row
-- anlegen. status='final' weil gutachten_ocr_processed_at gesetzt = Pipeline
-- ist durchgelaufen. Skipt Claims die schon eine gutachten-Row haben.
INSERT INTO public.gutachten (
  claim_id, sv_id, status, fertiggestellt_am,
  -- Cluster F
  gutachten_datum, gutachten_ocr_processed_at, gutachten_ocr_raw,
  gutachten_ocr_error, gutachten_ocr_manuell_ueberschrieben,
  gutachten_fin, gutachten_kennzeichen, gutachten_erstzulassung,
  gutachten_laufleistung_km, gutachten_tuv_bis, gutachten_fahrzeug_typ,
  gutachten_farbe, gutachten_farbcode, gutachten_kraftstoff,
  gutachten_vorschaeden_text, gutachten_lackmesswert_max_my,
  gutachten_karosseriezustand,
  gutachten_zeit_ak_std, gutachten_zeit_kar_std, gutachten_zeit_lack_std,
  gutachten_lohnsatz_ak_eur, gutachten_lohnsatz_kar_eur, gutachten_lohnsatz_lack_eur,
  gutachten_materialkosten_eur, gutachten_lackmaterial_eur, gutachten_verbringung_eur,
  gutachten_mietwagen_klasse, gutachten_mietwagen_tagessatz_eur,
  gutachten_nutzungsausfall_tagessatz_eur,
  gutachten_sv_honorar_netto, gutachten_sv_honorar_brutto,
  gutachten_kalkulationssystem, gutachten_seitenzahl,
  -- Cluster G
  reparaturkosten_netto, reparaturkosten_brutto, minderwert, restwert,
  wiederbeschaffungswert, wiederbeschaffungsdauer_tage,
  nutzungsausfall_tage, totalschaden
)
SELECT
  c.id, f.sv_id, 'final', c.gutachten_ocr_processed_at,
  c.gutachten_datum, c.gutachten_ocr_processed_at, c.gutachten_ocr_raw,
  c.gutachten_ocr_error, COALESCE(c.gutachten_ocr_manuell_ueberschrieben, false),
  c.gutachten_fin, c.gutachten_kennzeichen, c.gutachten_erstzulassung,
  c.gutachten_laufleistung_km, c.gutachten_tuv_bis, c.gutachten_fahrzeug_typ,
  c.gutachten_farbe, c.gutachten_farbcode, c.gutachten_kraftstoff,
  c.gutachten_vorschaeden_text, c.gutachten_lackmesswert_max_my,
  c.gutachten_karosseriezustand,
  c.gutachten_zeit_ak_std, c.gutachten_zeit_kar_std, c.gutachten_zeit_lack_std,
  c.gutachten_lohnsatz_ak_eur, c.gutachten_lohnsatz_kar_eur, c.gutachten_lohnsatz_lack_eur,
  c.gutachten_materialkosten_eur, c.gutachten_lackmaterial_eur, c.gutachten_verbringung_eur,
  c.gutachten_mietwagen_klasse, c.gutachten_mietwagen_tagessatz_eur,
  c.gutachten_nutzungsausfall_tagessatz_eur,
  c.gutachten_sv_honorar_netto, c.gutachten_sv_honorar_brutto,
  c.gutachten_kalkulationssystem, c.gutachten_seitenzahl,
  c.reparaturkosten_netto, c.reparaturkosten_brutto, c.minderwert, c.restwert,
  c.wiederbeschaffungswert, c.wiederbeschaffungsdauer_tage,
  c.nutzungsausfall_tage, c.totalschaden
FROM public.claims c
JOIN public.faelle f ON f.claim_id = c.id
WHERE c.gutachten_ocr_processed_at IS NOT NULL
  AND f.sv_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.gutachten g WHERE g.claim_id = c.id);

-- ─────────────────────────────────────────────────────────────────────
-- Task 5: Postgres-Function apply_gutachten_ocr (Atomic Dual-Write)
-- ─────────────────────────────────────────────────────────────────────
-- apply_gutachten_ocr — schreibt atomic auf claims + gutachten in einer TX.
-- Aufruf-Pattern aus dem Application-Layer:
--   await admin.rpc('apply_gutachten_ocr', { p_claim_id: id, p_values: {...} })
--
-- p_values: jsonb-Map ColumnName → Wert. Alle 38 Spalten + die 5 Meta-Felder
-- (processed_at/raw/error/manuell_ueberschrieben/datum).
--
-- SECURITY DEFINER weil von OCR-Pipeline mit anon-Bezugskontext aufgerufen
-- werden kann; search_path explizit gesetzt (Security-Pflicht aus
-- supabase:supabase-Skill).
CREATE OR REPLACE FUNCTION public.apply_gutachten_ocr(
  p_claim_id uuid,
  p_values   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sv_id uuid;
BEGIN
  -- 1) claims-Tabelle: Update mit dynamic jsonb-zu-columns
  UPDATE public.claims SET
    gutachten_datum                     = COALESCE((p_values->>'gutachten_datum')::date, gutachten_datum),
    gutachten_ocr_processed_at          = COALESCE((p_values->>'gutachten_ocr_processed_at')::timestamptz, gutachten_ocr_processed_at),
    gutachten_ocr_raw                   = COALESCE(p_values->'gutachten_ocr_raw', gutachten_ocr_raw),
    gutachten_ocr_error                 = NULLIF(p_values->>'gutachten_ocr_error', ''),
    gutachten_ocr_manuell_ueberschrieben = COALESCE((p_values->>'gutachten_ocr_manuell_ueberschrieben')::boolean, gutachten_ocr_manuell_ueberschrieben),
    gutachten_fin                       = COALESCE(p_values->>'gutachten_fin', gutachten_fin),
    gutachten_kennzeichen               = COALESCE(p_values->>'gutachten_kennzeichen', gutachten_kennzeichen),
    gutachten_erstzulassung             = COALESCE((p_values->>'gutachten_erstzulassung')::date, gutachten_erstzulassung),
    gutachten_laufleistung_km           = COALESCE((p_values->>'gutachten_laufleistung_km')::integer, gutachten_laufleistung_km),
    gutachten_tuv_bis                   = COALESCE((p_values->>'gutachten_tuv_bis')::date, gutachten_tuv_bis),
    gutachten_fahrzeug_typ              = COALESCE(p_values->>'gutachten_fahrzeug_typ', gutachten_fahrzeug_typ),
    gutachten_farbe                     = COALESCE(p_values->>'gutachten_farbe', gutachten_farbe),
    gutachten_farbcode                  = COALESCE(p_values->>'gutachten_farbcode', gutachten_farbcode),
    gutachten_kraftstoff                = COALESCE(p_values->>'gutachten_kraftstoff', gutachten_kraftstoff),
    gutachten_vorschaeden_text          = COALESCE(p_values->>'gutachten_vorschaeden_text', gutachten_vorschaeden_text),
    gutachten_lackmesswert_max_my       = COALESCE((p_values->>'gutachten_lackmesswert_max_my')::numeric, gutachten_lackmesswert_max_my),
    gutachten_karosseriezustand         = COALESCE(p_values->>'gutachten_karosseriezustand', gutachten_karosseriezustand),
    gutachten_zeit_ak_std               = COALESCE((p_values->>'gutachten_zeit_ak_std')::numeric, gutachten_zeit_ak_std),
    gutachten_zeit_kar_std              = COALESCE((p_values->>'gutachten_zeit_kar_std')::numeric, gutachten_zeit_kar_std),
    gutachten_zeit_lack_std             = COALESCE((p_values->>'gutachten_zeit_lack_std')::numeric, gutachten_zeit_lack_std),
    gutachten_lohnsatz_ak_eur           = COALESCE((p_values->>'gutachten_lohnsatz_ak_eur')::numeric, gutachten_lohnsatz_ak_eur),
    gutachten_lohnsatz_kar_eur          = COALESCE((p_values->>'gutachten_lohnsatz_kar_eur')::numeric, gutachten_lohnsatz_kar_eur),
    gutachten_lohnsatz_lack_eur         = COALESCE((p_values->>'gutachten_lohnsatz_lack_eur')::numeric, gutachten_lohnsatz_lack_eur),
    gutachten_materialkosten_eur        = COALESCE((p_values->>'gutachten_materialkosten_eur')::numeric, gutachten_materialkosten_eur),
    gutachten_lackmaterial_eur          = COALESCE((p_values->>'gutachten_lackmaterial_eur')::numeric, gutachten_lackmaterial_eur),
    gutachten_verbringung_eur           = COALESCE((p_values->>'gutachten_verbringung_eur')::numeric, gutachten_verbringung_eur),
    gutachten_mietwagen_klasse          = COALESCE(p_values->>'gutachten_mietwagen_klasse', gutachten_mietwagen_klasse),
    gutachten_mietwagen_tagessatz_eur   = COALESCE((p_values->>'gutachten_mietwagen_tagessatz_eur')::numeric, gutachten_mietwagen_tagessatz_eur),
    gutachten_nutzungsausfall_tagessatz_eur = COALESCE((p_values->>'gutachten_nutzungsausfall_tagessatz_eur')::numeric, gutachten_nutzungsausfall_tagessatz_eur),
    gutachten_sv_honorar_netto          = COALESCE((p_values->>'gutachten_sv_honorar_netto')::numeric, gutachten_sv_honorar_netto),
    gutachten_sv_honorar_brutto         = COALESCE((p_values->>'gutachten_sv_honorar_brutto')::numeric, gutachten_sv_honorar_brutto),
    gutachten_kalkulationssystem        = COALESCE(p_values->>'gutachten_kalkulationssystem', gutachten_kalkulationssystem),
    gutachten_seitenzahl                = COALESCE((p_values->>'gutachten_seitenzahl')::integer, gutachten_seitenzahl),
    reparaturkosten_netto               = COALESCE((p_values->>'reparaturkosten_netto')::numeric, reparaturkosten_netto),
    reparaturkosten_brutto              = COALESCE((p_values->>'reparaturkosten_brutto')::numeric, reparaturkosten_brutto),
    minderwert                          = COALESCE((p_values->>'minderwert')::numeric, minderwert),
    restwert                            = COALESCE((p_values->>'restwert')::numeric, restwert),
    wiederbeschaffungswert              = COALESCE((p_values->>'wiederbeschaffungswert')::numeric, wiederbeschaffungswert),
    wiederbeschaffungsdauer_tage        = COALESCE((p_values->>'wiederbeschaffungsdauer_tage')::integer, wiederbeschaffungsdauer_tage),
    nutzungsausfall_tage                = COALESCE((p_values->>'nutzungsausfall_tage')::integer, nutzungsausfall_tage),
    totalschaden                        = COALESCE((p_values->>'totalschaden')::boolean, totalschaden)
  WHERE id = p_claim_id;

  -- 2) gutachten-Tabelle: Upsert (INSERT mit ON CONFLICT auf claim_id-UNIQUE)
  -- Brauchen sv_id fuer NOT-NULL-Constraint — aus faelle.sv_id holen.
  SELECT f.sv_id INTO v_sv_id FROM public.faelle f WHERE f.claim_id = p_claim_id;

  -- Wenn kein SV zugeordnet: kein gutachten-Row anlegen. View liefert dann
  -- via COALESCE die claims-Werte als Fallback — kein Datenverlust.
  IF v_sv_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.gutachten (
    claim_id, sv_id, status,
    gutachten_datum, gutachten_ocr_processed_at, gutachten_ocr_raw,
    gutachten_ocr_error, gutachten_ocr_manuell_ueberschrieben,
    gutachten_fin, gutachten_kennzeichen, gutachten_erstzulassung,
    gutachten_laufleistung_km, gutachten_tuv_bis, gutachten_fahrzeug_typ,
    gutachten_farbe, gutachten_farbcode, gutachten_kraftstoff,
    gutachten_vorschaeden_text, gutachten_lackmesswert_max_my,
    gutachten_karosseriezustand,
    gutachten_zeit_ak_std, gutachten_zeit_kar_std, gutachten_zeit_lack_std,
    gutachten_lohnsatz_ak_eur, gutachten_lohnsatz_kar_eur, gutachten_lohnsatz_lack_eur,
    gutachten_materialkosten_eur, gutachten_lackmaterial_eur, gutachten_verbringung_eur,
    gutachten_mietwagen_klasse, gutachten_mietwagen_tagessatz_eur,
    gutachten_nutzungsausfall_tagessatz_eur,
    gutachten_sv_honorar_netto, gutachten_sv_honorar_brutto,
    gutachten_kalkulationssystem, gutachten_seitenzahl,
    reparaturkosten_netto, reparaturkosten_brutto, minderwert, restwert,
    wiederbeschaffungswert, wiederbeschaffungsdauer_tage,
    nutzungsausfall_tage, totalschaden
  )
  SELECT p_claim_id, v_sv_id, 'final',
    c.gutachten_datum, c.gutachten_ocr_processed_at, c.gutachten_ocr_raw,
    c.gutachten_ocr_error, c.gutachten_ocr_manuell_ueberschrieben,
    c.gutachten_fin, c.gutachten_kennzeichen, c.gutachten_erstzulassung,
    c.gutachten_laufleistung_km, c.gutachten_tuv_bis, c.gutachten_fahrzeug_typ,
    c.gutachten_farbe, c.gutachten_farbcode, c.gutachten_kraftstoff,
    c.gutachten_vorschaeden_text, c.gutachten_lackmesswert_max_my,
    c.gutachten_karosseriezustand,
    c.gutachten_zeit_ak_std, c.gutachten_zeit_kar_std, c.gutachten_zeit_lack_std,
    c.gutachten_lohnsatz_ak_eur, c.gutachten_lohnsatz_kar_eur, c.gutachten_lohnsatz_lack_eur,
    c.gutachten_materialkosten_eur, c.gutachten_lackmaterial_eur, c.gutachten_verbringung_eur,
    c.gutachten_mietwagen_klasse, c.gutachten_mietwagen_tagessatz_eur,
    c.gutachten_nutzungsausfall_tagessatz_eur,
    c.gutachten_sv_honorar_netto, c.gutachten_sv_honorar_brutto,
    c.gutachten_kalkulationssystem, c.gutachten_seitenzahl,
    c.reparaturkosten_netto, c.reparaturkosten_brutto, c.minderwert, c.restwert,
    c.wiederbeschaffungswert, c.wiederbeschaffungsdauer_tage,
    c.nutzungsausfall_tage, c.totalschaden
  FROM public.claims c WHERE c.id = p_claim_id
  ON CONFLICT (claim_id) DO UPDATE SET
    gutachten_datum                     = EXCLUDED.gutachten_datum,
    gutachten_ocr_processed_at          = EXCLUDED.gutachten_ocr_processed_at,
    gutachten_ocr_raw                   = EXCLUDED.gutachten_ocr_raw,
    gutachten_ocr_error                 = EXCLUDED.gutachten_ocr_error,
    gutachten_ocr_manuell_ueberschrieben = EXCLUDED.gutachten_ocr_manuell_ueberschrieben,
    gutachten_fin                       = EXCLUDED.gutachten_fin,
    gutachten_kennzeichen               = EXCLUDED.gutachten_kennzeichen,
    gutachten_erstzulassung             = EXCLUDED.gutachten_erstzulassung,
    gutachten_laufleistung_km           = EXCLUDED.gutachten_laufleistung_km,
    gutachten_tuv_bis                   = EXCLUDED.gutachten_tuv_bis,
    gutachten_fahrzeug_typ              = EXCLUDED.gutachten_fahrzeug_typ,
    gutachten_farbe                     = EXCLUDED.gutachten_farbe,
    gutachten_farbcode                  = EXCLUDED.gutachten_farbcode,
    gutachten_kraftstoff                = EXCLUDED.gutachten_kraftstoff,
    gutachten_vorschaeden_text          = EXCLUDED.gutachten_vorschaeden_text,
    gutachten_lackmesswert_max_my       = EXCLUDED.gutachten_lackmesswert_max_my,
    gutachten_karosseriezustand         = EXCLUDED.gutachten_karosseriezustand,
    gutachten_zeit_ak_std               = EXCLUDED.gutachten_zeit_ak_std,
    gutachten_zeit_kar_std              = EXCLUDED.gutachten_zeit_kar_std,
    gutachten_zeit_lack_std             = EXCLUDED.gutachten_zeit_lack_std,
    gutachten_lohnsatz_ak_eur           = EXCLUDED.gutachten_lohnsatz_ak_eur,
    gutachten_lohnsatz_kar_eur          = EXCLUDED.gutachten_lohnsatz_kar_eur,
    gutachten_lohnsatz_lack_eur         = EXCLUDED.gutachten_lohnsatz_lack_eur,
    gutachten_materialkosten_eur        = EXCLUDED.gutachten_materialkosten_eur,
    gutachten_lackmaterial_eur          = EXCLUDED.gutachten_lackmaterial_eur,
    gutachten_verbringung_eur           = EXCLUDED.gutachten_verbringung_eur,
    gutachten_mietwagen_klasse          = EXCLUDED.gutachten_mietwagen_klasse,
    gutachten_mietwagen_tagessatz_eur   = EXCLUDED.gutachten_mietwagen_tagessatz_eur,
    gutachten_nutzungsausfall_tagessatz_eur = EXCLUDED.gutachten_nutzungsausfall_tagessatz_eur,
    gutachten_sv_honorar_netto          = EXCLUDED.gutachten_sv_honorar_netto,
    gutachten_sv_honorar_brutto         = EXCLUDED.gutachten_sv_honorar_brutto,
    gutachten_kalkulationssystem        = EXCLUDED.gutachten_kalkulationssystem,
    gutachten_seitenzahl                = EXCLUDED.gutachten_seitenzahl,
    reparaturkosten_netto               = EXCLUDED.reparaturkosten_netto,
    reparaturkosten_brutto              = EXCLUDED.reparaturkosten_brutto,
    minderwert                          = EXCLUDED.minderwert,
    restwert                            = EXCLUDED.restwert,
    wiederbeschaffungswert              = EXCLUDED.wiederbeschaffungswert,
    wiederbeschaffungsdauer_tage        = EXCLUDED.wiederbeschaffungsdauer_tage,
    nutzungsausfall_tage                = EXCLUDED.nutzungsausfall_tage,
    totalschaden                        = EXCLUDED.totalschaden;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_gutachten_ocr(uuid, jsonb) TO authenticated;
-- service_role hat per Default execute, daher kein extra GRANT noetig

COMMENT ON FUNCTION public.apply_gutachten_ocr IS
  'AAR Cluster F+G PR-1: Atomic Dual-Write OCR-Werte auf claims + gutachten. '
  'p_values = jsonb-Map ColumnName -> Wert. NULL-Values im jsonb fuehren '
  'COALESCE auf bestehende DB-Werte (keine accidental NULL-Overwrites). '
  'Wird in PR-2 zurueck auf gutachten-only umgestellt + claims-Write entfernt.';

-- ─────────────────────────────────────────────────────────────────────
-- Task 6: View v_gutachten_werte (Dual-Source mit COALESCE)
-- ─────────────────────────────────────────────────────────────────────
-- v_gutachten_werte — Reader-Layer fuer alle 38 Werte. In dieser
-- Uebergangsphase mit COALESCE: bevorzugt gutachten-Wert, faellt auf
-- claims-Wert zurueck wenn gutachten-Row noch nicht existiert oder das
-- Feld dort NULL ist. Nach PR-2 (claims-Spalten gedroppt) wird die View
-- ohne COALESCE neu definiert.
--
-- security_invoker=true: View bleibt mit User-Identity-Bezug; bestehende
-- RLS auf claims + gutachten greift weiter (kein Bypass-Risiko).
DROP VIEW IF EXISTS public.v_gutachten_werte;
CREATE VIEW public.v_gutachten_werte
WITH (security_invoker = true)
AS
SELECT
  c.id AS claim_id,
  c.lead_id,
  g.id AS gutachten_id,
  g.sv_id,
  g.status AS gutachten_status,
  -- Cluster F (30 Felder, COALESCE gutachten -> claims)
  COALESCE(g.gutachten_datum, c.gutachten_datum)                         AS gutachten_datum,
  COALESCE(g.gutachten_ocr_processed_at, c.gutachten_ocr_processed_at)   AS gutachten_ocr_processed_at,
  COALESCE(g.gutachten_ocr_raw, c.gutachten_ocr_raw)                     AS gutachten_ocr_raw,
  COALESCE(g.gutachten_ocr_error, c.gutachten_ocr_error)                 AS gutachten_ocr_error,
  COALESCE(g.gutachten_ocr_manuell_ueberschrieben, c.gutachten_ocr_manuell_ueberschrieben) AS gutachten_ocr_manuell_ueberschrieben,
  COALESCE(g.gutachten_fin, c.gutachten_fin)                             AS gutachten_fin,
  COALESCE(g.gutachten_kennzeichen, c.gutachten_kennzeichen)             AS gutachten_kennzeichen,
  COALESCE(g.gutachten_erstzulassung, c.gutachten_erstzulassung)         AS gutachten_erstzulassung,
  COALESCE(g.gutachten_laufleistung_km, c.gutachten_laufleistung_km)     AS gutachten_laufleistung_km,
  COALESCE(g.gutachten_tuv_bis, c.gutachten_tuv_bis)                     AS gutachten_tuv_bis,
  COALESCE(g.gutachten_fahrzeug_typ, c.gutachten_fahrzeug_typ)           AS gutachten_fahrzeug_typ,
  COALESCE(g.gutachten_farbe, c.gutachten_farbe)                         AS gutachten_farbe,
  COALESCE(g.gutachten_farbcode, c.gutachten_farbcode)                   AS gutachten_farbcode,
  COALESCE(g.gutachten_kraftstoff, c.gutachten_kraftstoff)               AS gutachten_kraftstoff,
  COALESCE(g.gutachten_vorschaeden_text, c.gutachten_vorschaeden_text)   AS gutachten_vorschaeden_text,
  COALESCE(g.gutachten_lackmesswert_max_my, c.gutachten_lackmesswert_max_my) AS gutachten_lackmesswert_max_my,
  COALESCE(g.gutachten_karosseriezustand, c.gutachten_karosseriezustand) AS gutachten_karosseriezustand,
  COALESCE(g.gutachten_zeit_ak_std, c.gutachten_zeit_ak_std)             AS gutachten_zeit_ak_std,
  COALESCE(g.gutachten_zeit_kar_std, c.gutachten_zeit_kar_std)           AS gutachten_zeit_kar_std,
  COALESCE(g.gutachten_zeit_lack_std, c.gutachten_zeit_lack_std)         AS gutachten_zeit_lack_std,
  COALESCE(g.gutachten_lohnsatz_ak_eur, c.gutachten_lohnsatz_ak_eur)     AS gutachten_lohnsatz_ak_eur,
  COALESCE(g.gutachten_lohnsatz_kar_eur, c.gutachten_lohnsatz_kar_eur)   AS gutachten_lohnsatz_kar_eur,
  COALESCE(g.gutachten_lohnsatz_lack_eur, c.gutachten_lohnsatz_lack_eur) AS gutachten_lohnsatz_lack_eur,
  COALESCE(g.gutachten_materialkosten_eur, c.gutachten_materialkosten_eur) AS gutachten_materialkosten_eur,
  COALESCE(g.gutachten_lackmaterial_eur, c.gutachten_lackmaterial_eur)   AS gutachten_lackmaterial_eur,
  COALESCE(g.gutachten_verbringung_eur, c.gutachten_verbringung_eur)     AS gutachten_verbringung_eur,
  COALESCE(g.gutachten_mietwagen_klasse, c.gutachten_mietwagen_klasse)   AS gutachten_mietwagen_klasse,
  COALESCE(g.gutachten_mietwagen_tagessatz_eur, c.gutachten_mietwagen_tagessatz_eur) AS gutachten_mietwagen_tagessatz_eur,
  COALESCE(g.gutachten_nutzungsausfall_tagessatz_eur, c.gutachten_nutzungsausfall_tagessatz_eur) AS gutachten_nutzungsausfall_tagessatz_eur,
  COALESCE(g.gutachten_sv_honorar_netto, c.gutachten_sv_honorar_netto)   AS gutachten_sv_honorar_netto,
  COALESCE(g.gutachten_sv_honorar_brutto, c.gutachten_sv_honorar_brutto) AS gutachten_sv_honorar_brutto,
  COALESCE(g.gutachten_kalkulationssystem, c.gutachten_kalkulationssystem) AS gutachten_kalkulationssystem,
  COALESCE(g.gutachten_seitenzahl, c.gutachten_seitenzahl)               AS gutachten_seitenzahl,
  -- Cluster G (8 Felder)
  COALESCE(g.reparaturkosten_netto, c.reparaturkosten_netto)             AS reparaturkosten_netto,
  COALESCE(g.reparaturkosten_brutto, c.reparaturkosten_brutto)           AS reparaturkosten_brutto,
  COALESCE(g.minderwert, c.minderwert)                                   AS minderwert,
  COALESCE(g.restwert, c.restwert)                                       AS restwert,
  COALESCE(g.wiederbeschaffungswert, c.wiederbeschaffungswert)           AS wiederbeschaffungswert,
  COALESCE(g.wiederbeschaffungsdauer_tage, c.wiederbeschaffungsdauer_tage) AS wiederbeschaffungsdauer_tage,
  COALESCE(g.nutzungsausfall_tage, c.nutzungsausfall_tage)               AS nutzungsausfall_tage,
  COALESCE(g.totalschaden, c.totalschaden)                               AS totalschaden
FROM public.claims c
LEFT JOIN public.gutachten g ON g.claim_id = c.id;

GRANT SELECT ON public.v_gutachten_werte TO authenticated;

COMMENT ON VIEW public.v_gutachten_werte IS
  'AAR Cluster F+G PR-1: Dual-Source-Reader (claims + gutachten via COALESCE). '
  'PR-2 stellt 25 Reader auf diese View um. Nach claims-Drop wird die View '
  'ohne COALESCE neu definiert — dann nur noch gutachten-Source.';

COMMIT;
