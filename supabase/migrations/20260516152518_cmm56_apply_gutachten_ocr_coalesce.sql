-- CMM-56 — apply_gutachten_ocr Fresh-Insert-robust machen.
--
-- Die RPC apply_gutachten_ocr inserted beim Fresh-Row die NOT-NULL-Spalte
-- gutachten.gutachten_ocr_manuell_ueberschrieben explizit aus p_values. Beim
-- expliziten Insert greift der Spalten-DEFAULT nicht — liefert der Caller den
-- Key nicht in p_values, landet NULL in der NOT-NULL-Spalte und der ganze
-- RPC-Call schlaegt fehl. Die ON-CONFLICT-Branch derselben Funktion macht an
-- der Stelle bereits COALESCE(..., false) — die INSERT-VALUES-Branch nicht.
--
-- Fix: INSERT-VALUES fuer gutachten_ocr_manuell_ueberschrieben auf
-- COALESCE((p_values->>...)::boolean, false) angeglichen. Root-Cause — fixt
-- alle Caller (ocr-gutachten/route.ts caller-seitig in CMM-53 #1375 umgangen,
-- lib/ai/gutachten-ocr.ts lieferte den Key nicht).
--
-- Funktionskoerper = Live-Definition (pg_get_functiondef), nur die eine Zeile
-- geaendert. GRANT EXECUTE idempotent re-applied (Memory rls_function_grants).

BEGIN;

CREATE OR REPLACE FUNCTION public.apply_gutachten_ocr(p_claim_id uuid, p_values jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sv_id uuid;
BEGIN
  -- Brauchen sv_id für NOT-NULL-Constraint auf gutachten.
  SELECT f.sv_id INTO v_sv_id FROM public.faelle f WHERE f.claim_id = p_claim_id;

  -- Wenn kein SV zugeordnet: kein gutachten-Row anlegen.
  -- Caller müssen das tolerieren — typisch OCR-Werte landen erst sobald ein SV
  -- zugewiesen ist, vorher ist der Wert „verloren" (kein Fallback mehr seit PR-2b).
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
  VALUES (
    p_claim_id, v_sv_id, 'final',
    (p_values->>'gutachten_datum')::date,
    (p_values->>'gutachten_ocr_processed_at')::timestamptz,
    p_values->'gutachten_ocr_raw',
    NULLIF(p_values->>'gutachten_ocr_error', ''),
    COALESCE((p_values->>'gutachten_ocr_manuell_ueberschrieben')::boolean, false),
    p_values->>'gutachten_fin',
    p_values->>'gutachten_kennzeichen',
    (p_values->>'gutachten_erstzulassung')::date,
    (p_values->>'gutachten_laufleistung_km')::integer,
    (p_values->>'gutachten_tuv_bis')::date,
    p_values->>'gutachten_fahrzeug_typ',
    p_values->>'gutachten_farbe',
    p_values->>'gutachten_farbcode',
    p_values->>'gutachten_kraftstoff',
    p_values->>'gutachten_vorschaeden_text',
    (p_values->>'gutachten_lackmesswert_max_my')::numeric,
    p_values->>'gutachten_karosseriezustand',
    (p_values->>'gutachten_zeit_ak_std')::numeric,
    (p_values->>'gutachten_zeit_kar_std')::numeric,
    (p_values->>'gutachten_zeit_lack_std')::numeric,
    (p_values->>'gutachten_lohnsatz_ak_eur')::numeric,
    (p_values->>'gutachten_lohnsatz_kar_eur')::numeric,
    (p_values->>'gutachten_lohnsatz_lack_eur')::numeric,
    (p_values->>'gutachten_materialkosten_eur')::numeric,
    (p_values->>'gutachten_lackmaterial_eur')::numeric,
    (p_values->>'gutachten_verbringung_eur')::numeric,
    p_values->>'gutachten_mietwagen_klasse',
    (p_values->>'gutachten_mietwagen_tagessatz_eur')::numeric,
    (p_values->>'gutachten_nutzungsausfall_tagessatz_eur')::numeric,
    (p_values->>'gutachten_sv_honorar_netto')::numeric,
    (p_values->>'gutachten_sv_honorar_brutto')::numeric,
    p_values->>'gutachten_kalkulationssystem',
    (p_values->>'gutachten_seitenzahl')::integer,
    (p_values->>'reparaturkosten_netto')::numeric,
    (p_values->>'reparaturkosten_brutto')::numeric,
    (p_values->>'minderwert')::numeric,
    (p_values->>'restwert')::numeric,
    (p_values->>'wiederbeschaffungswert')::numeric,
    (p_values->>'wiederbeschaffungsdauer_tage')::integer,
    (p_values->>'nutzungsausfall_tage')::integer,
    (p_values->>'totalschaden')::boolean
  )
  ON CONFLICT (claim_id) DO UPDATE SET
    gutachten_datum                     = COALESCE(EXCLUDED.gutachten_datum, public.gutachten.gutachten_datum),
    gutachten_ocr_processed_at          = COALESCE(EXCLUDED.gutachten_ocr_processed_at, public.gutachten.gutachten_ocr_processed_at),
    gutachten_ocr_raw                   = COALESCE(EXCLUDED.gutachten_ocr_raw, public.gutachten.gutachten_ocr_raw),
    gutachten_ocr_error                 = EXCLUDED.gutachten_ocr_error,
    gutachten_ocr_manuell_ueberschrieben = COALESCE(EXCLUDED.gutachten_ocr_manuell_ueberschrieben, public.gutachten.gutachten_ocr_manuell_ueberschrieben),
    gutachten_fin                       = COALESCE(EXCLUDED.gutachten_fin, public.gutachten.gutachten_fin),
    gutachten_kennzeichen               = COALESCE(EXCLUDED.gutachten_kennzeichen, public.gutachten.gutachten_kennzeichen),
    gutachten_erstzulassung             = COALESCE(EXCLUDED.gutachten_erstzulassung, public.gutachten.gutachten_erstzulassung),
    gutachten_laufleistung_km           = COALESCE(EXCLUDED.gutachten_laufleistung_km, public.gutachten.gutachten_laufleistung_km),
    gutachten_tuv_bis                   = COALESCE(EXCLUDED.gutachten_tuv_bis, public.gutachten.gutachten_tuv_bis),
    gutachten_fahrzeug_typ              = COALESCE(EXCLUDED.gutachten_fahrzeug_typ, public.gutachten.gutachten_fahrzeug_typ),
    gutachten_farbe                     = COALESCE(EXCLUDED.gutachten_farbe, public.gutachten.gutachten_farbe),
    gutachten_farbcode                  = COALESCE(EXCLUDED.gutachten_farbcode, public.gutachten.gutachten_farbcode),
    gutachten_kraftstoff                = COALESCE(EXCLUDED.gutachten_kraftstoff, public.gutachten.gutachten_kraftstoff),
    gutachten_vorschaeden_text          = COALESCE(EXCLUDED.gutachten_vorschaeden_text, public.gutachten.gutachten_vorschaeden_text),
    gutachten_lackmesswert_max_my       = COALESCE(EXCLUDED.gutachten_lackmesswert_max_my, public.gutachten.gutachten_lackmesswert_max_my),
    gutachten_karosseriezustand         = COALESCE(EXCLUDED.gutachten_karosseriezustand, public.gutachten.gutachten_karosseriezustand),
    gutachten_zeit_ak_std               = COALESCE(EXCLUDED.gutachten_zeit_ak_std, public.gutachten.gutachten_zeit_ak_std),
    gutachten_zeit_kar_std              = COALESCE(EXCLUDED.gutachten_zeit_kar_std, public.gutachten.gutachten_zeit_kar_std),
    gutachten_zeit_lack_std             = COALESCE(EXCLUDED.gutachten_zeit_lack_std, public.gutachten.gutachten_zeit_lack_std),
    gutachten_lohnsatz_ak_eur           = COALESCE(EXCLUDED.gutachten_lohnsatz_ak_eur, public.gutachten.gutachten_lohnsatz_ak_eur),
    gutachten_lohnsatz_kar_eur          = COALESCE(EXCLUDED.gutachten_lohnsatz_kar_eur, public.gutachten.gutachten_lohnsatz_kar_eur),
    gutachten_lohnsatz_lack_eur         = COALESCE(EXCLUDED.gutachten_lohnsatz_lack_eur, public.gutachten.gutachten_lohnsatz_lack_eur),
    gutachten_materialkosten_eur        = COALESCE(EXCLUDED.gutachten_materialkosten_eur, public.gutachten.gutachten_materialkosten_eur),
    gutachten_lackmaterial_eur          = COALESCE(EXCLUDED.gutachten_lackmaterial_eur, public.gutachten.gutachten_lackmaterial_eur),
    gutachten_verbringung_eur           = COALESCE(EXCLUDED.gutachten_verbringung_eur, public.gutachten.gutachten_verbringung_eur),
    gutachten_mietwagen_klasse          = COALESCE(EXCLUDED.gutachten_mietwagen_klasse, public.gutachten.gutachten_mietwagen_klasse),
    gutachten_mietwagen_tagessatz_eur   = COALESCE(EXCLUDED.gutachten_mietwagen_tagessatz_eur, public.gutachten.gutachten_mietwagen_tagessatz_eur),
    gutachten_nutzungsausfall_tagessatz_eur = COALESCE(EXCLUDED.gutachten_nutzungsausfall_tagessatz_eur, public.gutachten.gutachten_nutzungsausfall_tagessatz_eur),
    gutachten_sv_honorar_netto          = COALESCE(EXCLUDED.gutachten_sv_honorar_netto, public.gutachten.gutachten_sv_honorar_netto),
    gutachten_sv_honorar_brutto         = COALESCE(EXCLUDED.gutachten_sv_honorar_brutto, public.gutachten.gutachten_sv_honorar_brutto),
    gutachten_kalkulationssystem        = COALESCE(EXCLUDED.gutachten_kalkulationssystem, public.gutachten.gutachten_kalkulationssystem),
    gutachten_seitenzahl                = COALESCE(EXCLUDED.gutachten_seitenzahl, public.gutachten.gutachten_seitenzahl),
    reparaturkosten_netto               = COALESCE(EXCLUDED.reparaturkosten_netto, public.gutachten.reparaturkosten_netto),
    reparaturkosten_brutto              = COALESCE(EXCLUDED.reparaturkosten_brutto, public.gutachten.reparaturkosten_brutto),
    minderwert                          = COALESCE(EXCLUDED.minderwert, public.gutachten.minderwert),
    restwert                            = COALESCE(EXCLUDED.restwert, public.gutachten.restwert),
    wiederbeschaffungswert              = COALESCE(EXCLUDED.wiederbeschaffungswert, public.gutachten.wiederbeschaffungswert),
    wiederbeschaffungsdauer_tage        = COALESCE(EXCLUDED.wiederbeschaffungsdauer_tage, public.gutachten.wiederbeschaffungsdauer_tage),
    nutzungsausfall_tage                = COALESCE(EXCLUDED.nutzungsausfall_tage, public.gutachten.nutzungsausfall_tage),
    totalschaden                        = COALESCE(EXCLUDED.totalschaden, public.gutachten.totalschaden);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.apply_gutachten_ocr(uuid, jsonb) TO authenticated;

COMMIT;
