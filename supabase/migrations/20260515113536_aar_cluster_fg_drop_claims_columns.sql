-- Cluster F+G PR-2b (15.05.2026) — Drop claims F+G + faelle G + Trigger-Recreate.
--
-- Voraussetzungen:
--   - PR-1 (#1293) hat gutachten Sub-Table + apply_gutachten_ocr + v_gutachten_werte angelegt.
--   - PR-2a (#1306) hat 3 Reader (3 page.tsx) auf v_gutachten_werte umgestellt.
--   - PR-2b (diese): 2 weitere Reader (fall-finanzen.ts, get-kunde-faelle.ts) + 3 Writer
--     (seed-test-data, seed-testdata, kanzlei-wunsch SMOKE) umgestellt.
--
-- Diese Migration:
--   1. DROP View v_gutachten_werte (wird ohne COALESCE neu erstellt)
--   2. DROP View v_faelle_mit_aktuellem_termin (referenziert faelle.{4 G-cols})
--   3. apply_gutachten_ocr — claims-UPDATE-Block entfernt, schreibt nur noch gutachten
--   4. sync_claims_to_faelle — nutzungsausfall_tage, restwert, totalschaden, wiederbeschaffungswert raus
--   5. sync_faelle_to_claims — gleiche 4 Spalten raus
--   6. faelle: DROP 4 G-Spalten (nutzungsausfall_tage, restwert, totalschaden, wiederbeschaffungswert)
--   7. claims: DROP 41 Cluster-F+G-Spalten (33× gutachten_* + 8 Werte)
--   8. Recreate v_gutachten_werte — single-source gutachten (kein COALESCE)
--   9. Recreate v_faelle_mit_aktuellem_termin — ohne die 4 G-Spalten
--
-- Erwartung: v_faelle_mit_aktuellem_termin-Callers verlieren die 4 G-cols. Grep im src/
-- hat 0 Callers gefunden, die diese aus dem View selektieren — Type-Regen + Build verifiziert.

BEGIN;

-- 1) View droppen (wird unten ohne COALESCE neu angelegt)
DROP VIEW IF EXISTS public.v_gutachten_werte;

-- 2) v_faelle_mit_aktuellem_termin droppen — depends on faelle.{4 G-cols}
DROP VIEW IF EXISTS public.v_faelle_mit_aktuellem_termin;

-- 3) apply_gutachten_ocr ohne claims-UPDATE-Block — schreibt nur noch gutachten
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
    (p_values->>'gutachten_ocr_manuell_ueberschrieben')::boolean,
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

-- AAR-921 hat GRANT EXECUTE TO authenticated/service_role auf SECDEF-Functions
-- in pg_policies festgeschrieben; apply_gutachten_ocr ist nicht in einer Policy,
-- aber sollte für die Smoke/Test-Pfade explizit grantbar bleiben.
GRANT EXECUTE ON FUNCTION public.apply_gutachten_ocr(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_gutachten_ocr(uuid, jsonb) TO service_role;

-- 4) sync_claims_to_faelle ohne nutzungsausfall_tage, restwert, totalschaden, wiederbeschaffungswert
CREATE OR REPLACE FUNCTION public.sync_claims_to_faelle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  UPDATE public.faelle f
  SET
    abgeschlossen_am = CASE WHEN NEW.abgeschlossen_am IS DISTINCT FROM OLD.abgeschlossen_am THEN NEW.abgeschlossen_am ELSE f.abgeschlossen_am END,
    auslandskennzeichen = CASE WHEN NEW.auslandskennzeichen IS DISTINCT FROM OLD.auslandskennzeichen THEN NEW.auslandskennzeichen ELSE f.auslandskennzeichen END,
    brn = CASE WHEN NEW.brn IS DISTINCT FROM OLD.brn THEN NEW.brn ELSE f.brn END,
    fahrerflucht = CASE WHEN NEW.fahrerflucht IS DISTINCT FROM OLD.fahrerflucht THEN NEW.fahrerflucht ELSE f.fahrerflucht END,
    finanzierung_leasing = CASE WHEN NEW.finanzierung_leasing IS DISTINCT FROM OLD.finanzierung_leasing THEN NEW.finanzierung_leasing ELSE f.finanzierung_leasing END,
    finanzierungsgeber_adresse = CASE WHEN NEW.finanzierungsgeber_adresse IS DISTINCT FROM OLD.finanzierungsgeber_adresse THEN NEW.finanzierungsgeber_adresse ELSE f.finanzierungsgeber_adresse END,
    finanzierungsgeber_name = CASE WHEN NEW.finanzierungsgeber_name IS DISTINCT FROM OLD.finanzierungsgeber_name THEN NEW.finanzierungsgeber_name ELSE f.finanzierungsgeber_name END,
    finanzierungsgeber_vertragsnr = CASE WHEN NEW.finanzierungsgeber_vertragsnr IS DISTINCT FROM OLD.finanzierungsgeber_vertragsnr THEN NEW.finanzierungsgeber_vertragsnr ELSE f.finanzierungsgeber_vertragsnr END,
    gegner_bekannt = CASE WHEN NEW.gegner_bekannt IS DISTINCT FROM OLD.gegner_bekannt THEN NEW.gegner_bekannt ELSE f.gegner_bekannt END,
    gegner_versicherung_id = CASE WHEN NEW.gegner_versicherung_id IS DISTINCT FROM OLD.gegner_versicherung_id THEN NEW.gegner_versicherung_id ELSE f.gegner_versicherung_id END,
    gegner_versicherungsnummer = CASE WHEN NEW.gegner_versicherungsnummer IS DISTINCT FROM OLD.gegner_versicherungsnummer THEN NEW.gegner_versicherungsnummer ELSE f.gegner_versicherungsnummer END,
    gewerbe_flag = CASE WHEN NEW.gewerbe_flag IS DISTINCT FROM OLD.gewerbe_flag THEN NEW.gewerbe_flag ELSE f.gewerbe_flag END,
    kanzlei_ansprechpartner_email = CASE WHEN NEW.kanzlei_ansprechpartner_email IS DISTINCT FROM OLD.kanzlei_ansprechpartner_email THEN NEW.kanzlei_ansprechpartner_email ELSE f.kanzlei_ansprechpartner_email END,
    kanzlei_ansprechpartner_name = CASE WHEN NEW.kanzlei_ansprechpartner_name IS DISTINCT FROM OLD.kanzlei_ansprechpartner_name THEN NEW.kanzlei_ansprechpartner_name ELSE f.kanzlei_ansprechpartner_name END,
    kanzlei_ansprechpartner_telefon = CASE WHEN NEW.kanzlei_ansprechpartner_telefon IS DISTINCT FROM OLD.kanzlei_ansprechpartner_telefon THEN NEW.kanzlei_ansprechpartner_telefon ELSE f.kanzlei_ansprechpartner_telefon END,
    kanzlei_uebergeben_am = CASE WHEN NEW.kanzlei_uebergeben_am IS DISTINCT FROM OLD.kanzlei_uebergeben_am THEN NEW.kanzlei_uebergeben_am ELSE f.kanzlei_uebergeben_am END,
    kunde_email = CASE WHEN NEW.kunde_email IS DISTINCT FROM OLD.kunde_email THEN NEW.kunde_email ELSE f.kunde_email END,
    kunden_konstellation = CASE WHEN NEW.kunden_konstellation IS DISTINCT FROM OLD.kunden_konstellation THEN NEW.kunden_konstellation ELSE f.kunden_konstellation END,
    kundenbetreuer_id = CASE WHEN NEW.kundenbetreuer_id IS DISTINCT FROM OLD.kundenbetreuer_id THEN NEW.kundenbetreuer_id ELSE f.kundenbetreuer_id END,
    polizei_aktenzeichen = CASE WHEN NEW.polizei_aktenzeichen IS DISTINCT FROM OLD.polizei_aktenzeichen THEN NEW.polizei_aktenzeichen ELSE f.polizei_aktenzeichen END,
    polizei_bericht_vorhanden = CASE WHEN NEW.polizei_bericht_vorhanden IS DISTINCT FROM OLD.polizei_bericht_vorhanden THEN NEW.polizei_bericht_vorhanden ELSE f.polizei_bericht_vorhanden END,
    polizei_vor_ort = CASE WHEN NEW.polizei_vor_ort IS DISTINCT FROM OLD.polizei_vor_ort THEN NEW.polizei_vor_ort ELSE f.polizei_vor_ort END,
    polizeibericht_status = CASE WHEN NEW.polizeibericht_status IS DISTINCT FROM OLD.polizeibericht_status THEN NEW.polizeibericht_status ELSE f.polizeibericht_status END,
    sachschaden_beschreibung = CASE WHEN NEW.sachschaden_beschreibung IS DISTINCT FROM OLD.sachschaden_beschreibung THEN NEW.sachschaden_beschreibung ELSE f.sachschaden_beschreibung END,
    spezifikation = CASE WHEN NEW.spezifikation IS DISTINCT FROM OLD.spezifikation THEN NEW.spezifikation ELSE f.spezifikation END,
    unfall_konstellation = CASE WHEN NEW.unfall_konstellation IS DISTINCT FROM OLD.unfall_konstellation THEN NEW.unfall_konstellation ELSE f.unfall_konstellation END,
    unfallskizze_ablehnung_grund = CASE WHEN NEW.unfallskizze_ablehnung_grund IS DISTINCT FROM OLD.unfallskizze_ablehnung_grund THEN NEW.unfallskizze_ablehnung_grund ELSE f.unfallskizze_ablehnung_grund END,
    unfallskizze_bestaetigt = CASE WHEN NEW.unfallskizze_bestaetigt IS DISTINCT FROM OLD.unfallskizze_bestaetigt THEN NEW.unfallskizze_bestaetigt ELSE f.unfallskizze_bestaetigt END,
    unfallskizze_generiert_am = CASE WHEN NEW.unfallskizze_generiert_am IS DISTINCT FROM OLD.unfallskizze_generiert_am THEN NEW.unfallskizze_generiert_am ELSE f.unfallskizze_generiert_am END,
    unfallskizze_svg = CASE WHEN NEW.unfallskizze_svg IS DISTINCT FROM OLD.unfallskizze_svg THEN NEW.unfallskizze_svg ELSE f.unfallskizze_svg END,
    unfallskizze_url = CASE WHEN NEW.unfallskizze_url IS DISTINCT FROM OLD.unfallskizze_url THEN NEW.unfallskizze_url ELSE f.unfallskizze_url END,
    vehicle_id = CASE WHEN NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN NEW.vehicle_id ELSE f.vehicle_id END,
    vorsteuerabzugsberechtigt = CASE WHEN NEW.vorsteuerabzugsberechtigt IS DISTINCT FROM OLD.vorsteuerabzugsberechtigt THEN NEW.vorsteuerabzugsberechtigt ELSE f.vorsteuerabzugsberechtigt END,
    zeugen_kontakte = CASE WHEN NEW.zeugen_kontakte IS DISTINCT FROM OLD.zeugen_kontakte THEN NEW.zeugen_kontakte ELSE f.zeugen_kontakte END,
    updated_at = NOW()
  WHERE f.claim_id = NEW.id;

  RETURN NEW;
END;
$function$;

-- 5) sync_faelle_to_claims ohne nutzungsausfall_tage, restwert, totalschaden, wiederbeschaffungswert
CREATE OR REPLACE FUNCTION public.sync_faelle_to_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.claim_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.claims c
  SET
    abgeschlossen_am = CASE WHEN NEW.abgeschlossen_am IS DISTINCT FROM OLD.abgeschlossen_am THEN NEW.abgeschlossen_am ELSE c.abgeschlossen_am END,
    auslandskennzeichen = CASE WHEN NEW.auslandskennzeichen IS DISTINCT FROM OLD.auslandskennzeichen THEN NEW.auslandskennzeichen ELSE c.auslandskennzeichen END,
    brn = CASE WHEN NEW.brn IS DISTINCT FROM OLD.brn THEN NEW.brn ELSE c.brn END,
    fahrerflucht = CASE WHEN NEW.fahrerflucht IS DISTINCT FROM OLD.fahrerflucht THEN NEW.fahrerflucht ELSE c.fahrerflucht END,
    finanzierung_leasing = CASE WHEN NEW.finanzierung_leasing IS DISTINCT FROM OLD.finanzierung_leasing THEN NEW.finanzierung_leasing ELSE c.finanzierung_leasing END,
    finanzierungsgeber_adresse = CASE WHEN NEW.finanzierungsgeber_adresse IS DISTINCT FROM OLD.finanzierungsgeber_adresse THEN NEW.finanzierungsgeber_adresse ELSE c.finanzierungsgeber_adresse END,
    finanzierungsgeber_name = CASE WHEN NEW.finanzierungsgeber_name IS DISTINCT FROM OLD.finanzierungsgeber_name THEN NEW.finanzierungsgeber_name ELSE c.finanzierungsgeber_name END,
    finanzierungsgeber_vertragsnr = CASE WHEN NEW.finanzierungsgeber_vertragsnr IS DISTINCT FROM OLD.finanzierungsgeber_vertragsnr THEN NEW.finanzierungsgeber_vertragsnr ELSE c.finanzierungsgeber_vertragsnr END,
    gegner_bekannt = CASE WHEN NEW.gegner_bekannt IS DISTINCT FROM OLD.gegner_bekannt THEN NEW.gegner_bekannt ELSE c.gegner_bekannt END,
    gegner_versicherung_id = CASE WHEN NEW.gegner_versicherung_id IS DISTINCT FROM OLD.gegner_versicherung_id THEN NEW.gegner_versicherung_id ELSE c.gegner_versicherung_id END,
    gegner_versicherungsnummer = CASE WHEN NEW.gegner_versicherungsnummer IS DISTINCT FROM OLD.gegner_versicherungsnummer THEN NEW.gegner_versicherungsnummer ELSE c.gegner_versicherungsnummer END,
    gewerbe_flag = CASE WHEN NEW.gewerbe_flag IS DISTINCT FROM OLD.gewerbe_flag THEN NEW.gewerbe_flag ELSE c.gewerbe_flag END,
    kanzlei_ansprechpartner_email = CASE WHEN NEW.kanzlei_ansprechpartner_email IS DISTINCT FROM OLD.kanzlei_ansprechpartner_email THEN NEW.kanzlei_ansprechpartner_email ELSE c.kanzlei_ansprechpartner_email END,
    kanzlei_ansprechpartner_name = CASE WHEN NEW.kanzlei_ansprechpartner_name IS DISTINCT FROM OLD.kanzlei_ansprechpartner_name THEN NEW.kanzlei_ansprechpartner_name ELSE c.kanzlei_ansprechpartner_name END,
    kanzlei_ansprechpartner_telefon = CASE WHEN NEW.kanzlei_ansprechpartner_telefon IS DISTINCT FROM OLD.kanzlei_ansprechpartner_telefon THEN NEW.kanzlei_ansprechpartner_telefon ELSE c.kanzlei_ansprechpartner_telefon END,
    kanzlei_uebergeben_am = CASE WHEN NEW.kanzlei_uebergeben_am IS DISTINCT FROM OLD.kanzlei_uebergeben_am THEN NEW.kanzlei_uebergeben_am ELSE c.kanzlei_uebergeben_am END,
    kunde_email = CASE WHEN NEW.kunde_email IS DISTINCT FROM OLD.kunde_email THEN NEW.kunde_email ELSE c.kunde_email END,
    kunden_konstellation = CASE WHEN NEW.kunden_konstellation IS DISTINCT FROM OLD.kunden_konstellation THEN NEW.kunden_konstellation ELSE c.kunden_konstellation END,
    kundenbetreuer_id = CASE WHEN NEW.kundenbetreuer_id IS DISTINCT FROM OLD.kundenbetreuer_id THEN NEW.kundenbetreuer_id ELSE c.kundenbetreuer_id END,
    polizei_aktenzeichen = CASE WHEN NEW.polizei_aktenzeichen IS DISTINCT FROM OLD.polizei_aktenzeichen THEN NEW.polizei_aktenzeichen ELSE c.polizei_aktenzeichen END,
    polizei_bericht_vorhanden = CASE WHEN NEW.polizei_bericht_vorhanden IS DISTINCT FROM OLD.polizei_bericht_vorhanden THEN NEW.polizei_bericht_vorhanden ELSE c.polizei_bericht_vorhanden END,
    polizei_vor_ort = CASE WHEN NEW.polizei_vor_ort IS DISTINCT FROM OLD.polizei_vor_ort THEN NEW.polizei_vor_ort ELSE c.polizei_vor_ort END,
    polizeibericht_status = CASE WHEN NEW.polizeibericht_status IS DISTINCT FROM OLD.polizeibericht_status THEN NEW.polizeibericht_status ELSE c.polizeibericht_status END,
    sachschaden_beschreibung = CASE WHEN NEW.sachschaden_beschreibung IS DISTINCT FROM OLD.sachschaden_beschreibung THEN NEW.sachschaden_beschreibung ELSE c.sachschaden_beschreibung END,
    spezifikation = CASE WHEN NEW.spezifikation IS DISTINCT FROM OLD.spezifikation THEN NEW.spezifikation ELSE c.spezifikation END,
    unfall_konstellation = CASE WHEN NEW.unfall_konstellation IS DISTINCT FROM OLD.unfall_konstellation THEN NEW.unfall_konstellation ELSE c.unfall_konstellation END,
    unfallskizze_ablehnung_grund = CASE WHEN NEW.unfallskizze_ablehnung_grund IS DISTINCT FROM OLD.unfallskizze_ablehnung_grund THEN NEW.unfallskizze_ablehnung_grund ELSE c.unfallskizze_ablehnung_grund END,
    unfallskizze_bestaetigt = CASE WHEN NEW.unfallskizze_bestaetigt IS DISTINCT FROM OLD.unfallskizze_bestaetigt THEN NEW.unfallskizze_bestaetigt ELSE c.unfallskizze_bestaetigt END,
    unfallskizze_generiert_am = CASE WHEN NEW.unfallskizze_generiert_am IS DISTINCT FROM OLD.unfallskizze_generiert_am THEN NEW.unfallskizze_generiert_am ELSE c.unfallskizze_generiert_am END,
    unfallskizze_svg = CASE WHEN NEW.unfallskizze_svg IS DISTINCT FROM OLD.unfallskizze_svg THEN NEW.unfallskizze_svg ELSE c.unfallskizze_svg END,
    unfallskizze_url = CASE WHEN NEW.unfallskizze_url IS DISTINCT FROM OLD.unfallskizze_url THEN NEW.unfallskizze_url ELSE c.unfallskizze_url END,
    vehicle_id = CASE WHEN NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN NEW.vehicle_id ELSE c.vehicle_id END,
    vorsteuerabzugsberechtigt = CASE WHEN NEW.vorsteuerabzugsberechtigt IS DISTINCT FROM OLD.vorsteuerabzugsberechtigt THEN NEW.vorsteuerabzugsberechtigt ELSE c.vorsteuerabzugsberechtigt END,
    zeugen_kontakte = CASE WHEN NEW.zeugen_kontakte IS DISTINCT FROM OLD.zeugen_kontakte THEN NEW.zeugen_kontakte ELSE c.zeugen_kontakte END,
    updated_at = NOW()
  WHERE c.id = NEW.claim_id;

  RETURN NEW;
END;
$function$;

-- 5.5) Trigger-Definitionen droppen — sie listen die 4 G-Spalten in `AFTER UPDATE OF`
-- explizit. Müssen also vor dem DROP COLUMN raus + danach neu mit angepasster col-list.
DROP TRIGGER IF EXISTS trg_sync_faelle_to_claims ON public.faelle;
DROP TRIGGER IF EXISTS trg_sync_claims_to_faelle ON public.claims;

-- 6) faelle: DROP 4 G-Spalten
ALTER TABLE public.faelle
  DROP COLUMN IF EXISTS nutzungsausfall_tage,
  DROP COLUMN IF EXISTS restwert,
  DROP COLUMN IF EXISTS totalschaden,
  DROP COLUMN IF EXISTS wiederbeschaffungswert;

-- 7) claims: DROP 41 Cluster-F+G-Spalten
ALTER TABLE public.claims
  DROP COLUMN IF EXISTS gutachten_datum,
  DROP COLUMN IF EXISTS gutachten_ocr_processed_at,
  DROP COLUMN IF EXISTS gutachten_ocr_raw,
  DROP COLUMN IF EXISTS gutachten_ocr_error,
  DROP COLUMN IF EXISTS gutachten_ocr_manuell_ueberschrieben,
  DROP COLUMN IF EXISTS gutachten_fin,
  DROP COLUMN IF EXISTS gutachten_kennzeichen,
  DROP COLUMN IF EXISTS gutachten_erstzulassung,
  DROP COLUMN IF EXISTS gutachten_laufleistung_km,
  DROP COLUMN IF EXISTS gutachten_tuv_bis,
  DROP COLUMN IF EXISTS gutachten_fahrzeug_typ,
  DROP COLUMN IF EXISTS gutachten_farbe,
  DROP COLUMN IF EXISTS gutachten_farbcode,
  DROP COLUMN IF EXISTS gutachten_kraftstoff,
  DROP COLUMN IF EXISTS gutachten_vorschaeden_text,
  DROP COLUMN IF EXISTS gutachten_lackmesswert_max_my,
  DROP COLUMN IF EXISTS gutachten_karosseriezustand,
  DROP COLUMN IF EXISTS gutachten_zeit_ak_std,
  DROP COLUMN IF EXISTS gutachten_zeit_kar_std,
  DROP COLUMN IF EXISTS gutachten_zeit_lack_std,
  DROP COLUMN IF EXISTS gutachten_lohnsatz_ak_eur,
  DROP COLUMN IF EXISTS gutachten_lohnsatz_kar_eur,
  DROP COLUMN IF EXISTS gutachten_lohnsatz_lack_eur,
  DROP COLUMN IF EXISTS gutachten_materialkosten_eur,
  DROP COLUMN IF EXISTS gutachten_lackmaterial_eur,
  DROP COLUMN IF EXISTS gutachten_verbringung_eur,
  DROP COLUMN IF EXISTS gutachten_mietwagen_klasse,
  DROP COLUMN IF EXISTS gutachten_mietwagen_tagessatz_eur,
  DROP COLUMN IF EXISTS gutachten_nutzungsausfall_tagessatz_eur,
  DROP COLUMN IF EXISTS gutachten_sv_honorar_netto,
  DROP COLUMN IF EXISTS gutachten_sv_honorar_brutto,
  DROP COLUMN IF EXISTS gutachten_kalkulationssystem,
  DROP COLUMN IF EXISTS gutachten_seitenzahl,
  DROP COLUMN IF EXISTS reparaturkosten_netto,
  DROP COLUMN IF EXISTS reparaturkosten_brutto,
  DROP COLUMN IF EXISTS minderwert,
  DROP COLUMN IF EXISTS restwert,
  DROP COLUMN IF EXISTS wiederbeschaffungswert,
  DROP COLUMN IF EXISTS wiederbeschaffungsdauer_tage,
  DROP COLUMN IF EXISTS nutzungsausfall_tage,
  DROP COLUMN IF EXISTS totalschaden;

-- 7.5) Sync-Trigger neu anlegen — ohne die 4 G-Spalten in `AFTER UPDATE OF`
CREATE TRIGGER trg_sync_claims_to_faelle
  AFTER UPDATE OF
    abgeschlossen_am, auslandskennzeichen, brn, fahrerflucht, finanzierung_leasing,
    finanzierungsgeber_adresse, finanzierungsgeber_name, finanzierungsgeber_vertragsnr,
    gegner_bekannt, gegner_versicherung_id, gegner_versicherungsnummer, gewerbe_flag,
    kanzlei_ansprechpartner_email, kanzlei_ansprechpartner_name,
    kanzlei_ansprechpartner_telefon, kanzlei_uebergeben_am, kunde_email,
    kunden_konstellation, kundenbetreuer_id, polizei_aktenzeichen,
    polizei_bericht_vorhanden, polizei_vor_ort, polizeibericht_status,
    sachschaden_beschreibung, spezifikation, unfall_konstellation,
    unfallskizze_ablehnung_grund, unfallskizze_bestaetigt, unfallskizze_generiert_am,
    unfallskizze_svg, unfallskizze_url, vehicle_id, vorsteuerabzugsberechtigt,
    zeugen_kontakte
  ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.sync_claims_to_faelle();

CREATE TRIGGER trg_sync_faelle_to_claims
  AFTER UPDATE OF
    abgeschlossen_am, auslandskennzeichen, bkat_unfallart, brn, fahrerflucht,
    finanzierung_leasing, finanzierungsgeber_adresse, finanzierungsgeber_name,
    finanzierungsgeber_vertragsnr, firma_name, gegner_bekannt, gegner_versicherung_id,
    gegner_versicherungsnummer, gewerbe_flag, kanzlei_ansprechpartner_email,
    kanzlei_ansprechpartner_name, kanzlei_ansprechpartner_telefon,
    kanzlei_uebergeben_am, kunde_email, kunden_konstellation, kundenbetreuer_id,
    polizei_aktenzeichen, polizei_bericht_vorhanden, polizei_vor_ort,
    polizeibericht_status, sachschaden_beschreibung, spezifikation,
    unfall_konstellation, unfallskizze_ablehnung_grund, unfallskizze_bestaetigt,
    unfallskizze_generiert_am, unfallskizze_svg, unfallskizze_url, vehicle_id,
    vorsteuerabzugsberechtigt, zeugen_kontakte
  ON public.faelle
  FOR EACH ROW EXECUTE FUNCTION public.sync_faelle_to_claims();

-- 8) v_gutachten_werte ohne COALESCE — Single-Source gutachten
CREATE VIEW public.v_gutachten_werte AS
SELECT
  c.id AS claim_id,
  c.lead_id,
  g.id AS gutachten_id,
  g.sv_id,
  g.status AS gutachten_status,
  g.gutachten_datum,
  g.gutachten_ocr_processed_at,
  g.gutachten_ocr_raw,
  g.gutachten_ocr_error,
  g.gutachten_ocr_manuell_ueberschrieben,
  g.gutachten_fin,
  g.gutachten_kennzeichen,
  g.gutachten_erstzulassung,
  g.gutachten_laufleistung_km,
  g.gutachten_tuv_bis,
  g.gutachten_fahrzeug_typ,
  g.gutachten_farbe,
  g.gutachten_farbcode,
  g.gutachten_kraftstoff,
  g.gutachten_vorschaeden_text,
  g.gutachten_lackmesswert_max_my,
  g.gutachten_karosseriezustand,
  g.gutachten_zeit_ak_std,
  g.gutachten_zeit_kar_std,
  g.gutachten_zeit_lack_std,
  g.gutachten_lohnsatz_ak_eur,
  g.gutachten_lohnsatz_kar_eur,
  g.gutachten_lohnsatz_lack_eur,
  g.gutachten_materialkosten_eur,
  g.gutachten_lackmaterial_eur,
  g.gutachten_verbringung_eur,
  g.gutachten_mietwagen_klasse,
  g.gutachten_mietwagen_tagessatz_eur,
  g.gutachten_nutzungsausfall_tagessatz_eur,
  g.gutachten_sv_honorar_netto,
  g.gutachten_sv_honorar_brutto,
  g.gutachten_kalkulationssystem,
  g.gutachten_seitenzahl,
  g.reparaturkosten_netto,
  g.reparaturkosten_brutto,
  g.minderwert,
  g.restwert,
  g.wiederbeschaffungswert,
  g.wiederbeschaffungsdauer_tage,
  g.nutzungsausfall_tage,
  g.totalschaden
FROM public.claims c
  LEFT JOIN public.gutachten g ON g.claim_id = c.id;

-- 9) v_faelle_mit_aktuellem_termin ohne die 4 G-Spalten
-- (Definition aus pg_get_viewdef minus restwert/totalschaden/wiederbeschaffungswert/nutzungsausfall_tage)
CREATE VIEW public.v_faelle_mit_aktuellem_termin AS
SELECT
  f.id, f.fall_nummer, f.lead_id, f.kunde_id, f.status, f.betreuungspaket,
  f.schadens_beschreibung, f.schadens_datum, f.schadens_entdeckt_am,
  f.schadens_adresse, f.schadens_plz, f.schadens_ort,
  f.abtretung_pdf, f.vollmacht_pdf, f.abtretung_signiert_am, f.vollmacht_signiert_am,
  f.sv_id, f.sv_zugewiesen_am, f.gutachten_eingegangen_am, f.gutachten_betrag,
  f.kanzlei_uebergeben_am, f.anschlussschreiben_am, f.regulierung_betrag, f.regulierung_am,
  f.filmcheck_ok, f.filmcheck_am, f.filmcheck_notizen, f.notizen, f.created_at, f.updated_at,
  f.schadens_fall_typ, f.kunden_konstellation, f.kennzeichen, f.fahrzeug_typ,
  f.fahrzeug_hersteller, f.fahrzeug_modell, f.fahrzeug_baujahr,
  f.gegner_name, f.gegner_versicherung, f.gegner_kennzeichen, f.gegner_bekannt,
  f.polizei_aktenzeichen, f.polizei_bericht_vorhanden, f.personenschaden_flag,
  f.mietwagen_flag, f.gewerbe_flag, f.halter_ungleich_fahrer_flag, f.ust_id,
  f.leasinggeber_name, f.leasinggeber_informiert, f.bank_name, f.prioritaet,
  f.onboarding_complete, f.dispatch_id, f.kundenbetreuer_id, f.konvertiert_am,
  f.konvertiert_von_lead, f.status_changed_at, f.regulierung_angekuendigt_am,
  f.zahlung_eingegangen_am, f.abgeschlossen_am, f.google_review_gesendet,
  f.vs_eskalationsstufe, f.fin_quelle, f.fin_extrahiert_am, f.vorschaden_geprueft,
  f.vorschaden_anzahl, f.vorschaden_letzter_datum, f.vorschaden_typ_a_ergebnis,
  f.vorschaden_typ_b_bericht, f.vorschaden_typ_b_pdf_url, f.cardentity_abfrage_am,
  f.schadens_hoehe_netto,
  f.nutzungsausfall_tagessatz, f.reparaturdauer_tage,
  f.gutachter_honorar,
  f.ocr_extrahiert_am, f.ocr_rohdaten, f.ki_kalkulation, f.ki_kalkulation_am,
  f.ki_geschaetzte_kosten_min, f.ki_geschaetzte_kosten_max,
  f.kanzlei_ansprechpartner_name, f.kanzlei_ansprechpartner_email,
  f.kanzlei_ansprechpartner_telefon, f.kanzlei_ansprechpartner_position,
  f.mandatsnummer, f.losfahren_erinnerung_gesendet, f.termin_erinnerung_5min_gesendet,
  f.geschaetzte_fahrzeit_min, f.geschaetzte_fahrdistanz_km, f.gcal_event_id,
  f.gutachten_vorhanden, f.gutachten_hochgeladen_am, f.gutachten_positionen,
  f.gutachten_nummer, f.reparaturkosten, f.wertminderung, f.nutzungsausfall_gesamt,
  f.regulierungsweise, f.gegner_versicherungsnummer, f.sa_unterschrieben,
  f.sa_unterschrieben_am, f.sa_pdf_url, f.sa_unterschrift_url,
  f.datenschutz_akzeptiert, f.datenschutz_akzeptiert_am,
  f.vollmacht_status, f.polizei_vor_ort, f.unfallhergang, f.unfallmitteilung_status,
  f.unfallort, f.unfalldatum, f.interne_notizen, f.anschlussschreiben_url,
  f.anschlussschreiben_sendedatum, f.anschlussschreiben_unterschrift,
  f.anschlussschreiben_ocr_am, f.besichtigungsort_adresse, f.besichtigungsort_lat,
  f.besichtigungsort_lng, f.besichtigungsort_place_id, f.ist_aktiv,
  f.deaktiviert_am, f.deaktiviert_grund, f.deaktiviert_notiz, f.szenario,
  f.ruege_erhalten_am, f.ruege_grund, f.fahrzeug_farbe, f.erstzulassung,
  f.kilometerstand, f.firma_name, f.marketing_quelle, f.marketing_provision,
  f.marketing_provision_status, f.gutachten_stundensatz, f.kanzlei_id,
  f.kanzlei_honorar, f.zahlung_erwartet_am, f.zahlung_betrag, f.lead_preis_netto,
  f.lead_preis_typ, f.lead_preis_berechnet_am, f.guthaben_verrechnet_netto,
  f.sv_nachzahlung_netto, f.abrechnung_id, f.storniert_am, f.storno_grund,
  f.storno_durch_user_id, f.no_show_gemeldet_am, f.spezifikation, f.schadens_art,
  f.organisation_id, f.aktuelle_phase, f.dokumente_vollstaendig_fuer_phase,
  f.dokumente_vollstaendig_am_phase, f.unfall_konstellation,
  f.gegner_anzahl_beteiligte, f.gegner_fahrzeugtyp,
  f.dokumente_reminder_whatsapp_letzte_sendung, f.fin_vin, f.source_channel,
  f.source_domain, f.schadens_ursache, f.kanzlei_abrechnung_id,
  f.kanzlei_provision_status, f.kanzlei_provision_ausgezahlt_am, f.service_typ,
  f.vs_reaktion_typ, f.vs_reaktion_am, f.vs_ablehnungsgrund, f.ruege_gesendet_am,
  f.ruege_betrag, f.no_show_count, f.kuerzungs_betrag, f.vs_frist_bis,
  f.ruege_counter, f.schlussabrechnung_am, f.iban, f.bic, f.kontoinhaber,
  f.bankdaten_hinterlegt_am, f.ist_fahrzeughalter, f.finanzierung_leasing,
  f.vorsteuerabzugsberechtigt, f.schadens_hergang, f.halter_vorname, f.halter_nachname,
  f.halter_strasse, f.halter_plz, f.halter_stadt, f.halter_telefon, f.halter_email,
  f.finanzierungsgeber_name, f.finanzierungsgeber_adresse, f.finanzierungsgeber_vertragsnr,
  f.zahlungsweg, f.hat_vorschaeden, f.vorschaeden_beschreibung,
  f.technische_stellungnahme_status, f.technische_stellungnahme_beauftragt_am,
  f.technische_stellungnahme_hochgeladen_am, f.technische_stellungnahme_freigabe_am,
  f.nachbesichtigung_status, f.nachbesichtigung_angefordert_am,
  f.nachbesichtigung_termin_datum, f.nachbesichtigung_konfrontation,
  f.as_geforderte_summe, f.as_frist, f.as_vs_reaktion_text, f.as_salesforce_id,
  f.as_zuletzt_synced_am, f.lexdrive_case_id, f.eskalation_tag_14_am,
  f.eskalation_tag_21_am, f.eskalation_tag_28_am, f.unfallort_kategorie,
  f.unfallskizze_url, f.fahrzeug_ausstattung, f.cardentity_enriched_at,
  f.cardentity_report, f.vollmacht_geprueft_am, f.vollmacht_geprueft_von,
  f.vollmacht_pruefung_status, f.vollmacht_pruefung_begruendung,
  f.lexdrive_ocr_data, f.lexdrive_ocr_received_at, f.vs_kuerzung_grund,
  f.geschlossen_grund, f.nachbesichtigung_ergebnis, f.bevorzugter_kanal,
  f.gegner_versicherung_id, f.zeugen_kontakte, f.werkstatt_seit_datum,
  f.fahrzeug_fahrbereit, f.nutzungsausfall, f.mietwagen_kanzlei_informiert,
  f.mietwagen_kanzlei_informiert_am, f.halter_geburtsdatum, f.abrechnungsart_besprochen,
  f.abrechnungsart_notiz, f.abrechnungsart_besprochen_am,
  f.gegner_versicherung_anfrage_datum, f.sprache, f.unfallskizze_svg,
  f.unfallskizze_bestaetigt, f.unfallskizze_ablehnung_grund,
  f.unfallskizze_generiert_am, f.zeugen_vorhanden, f.vorschaden_erkannt,
  f.sv_termin_dokument_reminder_gesendet_am, f.kundenbetreuer_fallback_flag,
  f.kundenbetreuer_zugewiesen_am, f.sv_briefing_text, f.sv_briefing_generated_at,
  f.sv_briefing_model, f.sv_briefing_version, f.sv_briefing_struktur,
  f.sv_notizen_vor_ort, f.makler_id, f.sachschaden_flag, f.sachschaden_beschreibung,
  f.gegner_schadennummer, f.halter_name, f.wunschtermin, f.vs_quote_prozent,
  f.vs_quote_grund, f.vs_quote_akzeptiert_am, f.vs_quote_betrag_ausgezahlt,
  f.vs_kuerzungs_typ, f.auszahlung_kunde_betrag, f.auszahlung_kunde_eingegangen_am,
  f.auszahlung_gutachter_eingegangen_am, f.auszahlung_zahlungsweg,
  f.eskalation_tag_14_ergebnis, f.eskalation_tag_14_ergebnis_am,
  f.eskalation_tag_14_ergebnis_von, f.eskalation_tag_21_ergebnis,
  f.eskalation_tag_21_ergebnis_am, f.eskalation_tag_21_ergebnis_von,
  f.eskalation_tag_28_ergebnis, f.eskalation_tag_28_ergebnis_am,
  f.eskalation_tag_28_ergebnis_von, f.nachbesichtigung_kunde_termin_vorschlaege,
  f.nachbesichtigung_kunde_termin_eingereicht_am,
  f.nachbesichtigung_sv_konfrontation_gewuenscht,
  f.nachbesichtigung_sv_termin_vereinbart_am, f.auszahlung_gutachter_betrag,
  f.ruege_frist_tage, f.klage_uebergeben_am, f.fallakte_angelegt_am,
  f.kunde_vorname, f.kunde_nachname, f.kunde_telefon, f.kunde_email,
  f.kunde_strasse, f.kunde_plz, f.kunde_stadt, f.kunde_adresse,
  f.kunde_lat, f.kunde_lng, f.hsn, f.tsn, f.technische_stellungnahme_notiz_sv,
  f.fahrerflucht, f.auslandskennzeichen, f.polizeibericht_status, f.zb1_status,
  f.unfall_uhrzeit, f.unfallort_lat, f.unfallort_lng, f.bkat_unfallart,
  f.fahrzeugschaden_beschreibung, f.mietwagen_hat, f.mietwagen_seit_datum,
  f.mietwagen_limit_tage, f.mietwagen_limit_grund, f.mietwagen_rechnung_vorhanden,
  f.mietwagen_rechnung_url, f.mietwagen_argumentations_puffer, f.mietwagen_vermieter,
  f.vehicle_id, f.claim_id, f.lackfarbe_code,
  t.id AS aktueller_termin_id,
  t.start_zeit AS aktueller_termin_start,
  t.end_zeit AS aktueller_termin_end,
  t.status AS aktueller_termin_status,
  t.sv_id AS aktueller_termin_sv_id,
  t.kanal AS aktueller_termin_kanal,
  t.typ AS aktueller_termin_typ,
  t.final_verbindlich_ab AS aktueller_termin_final_verbindlich_ab,
  t.start_zeit AS sv_termin,
  t.status AS gutachter_termin_status,
  t.status = 'bestaetigt'::text AS gutachter_termin_bestaetigt,
  t.vorgeschlagenes_datum AS gutachter_gegenvorschlag_datum,
  t.gegenvorschlag_grund AS gutachter_gegenvorschlag_grund
FROM public.faelle f
  LEFT JOIN LATERAL (
    SELECT gt.*
    FROM public.gutachter_termine gt
    WHERE gt.fall_id = f.id
      AND gt.status = ANY (ARRAY['bestaetigt'::text, 'verlegung_pending'::text, 'reserviert'::text, 'durchgefuehrt'::text, 'gegenvorschlag'::text])
    ORDER BY (
      CASE gt.status
        WHEN 'bestaetigt'::text THEN 1
        WHEN 'verlegung_pending'::text THEN 2
        WHEN 'gegenvorschlag'::text THEN 3
        WHEN 'reserviert'::text THEN 4
        WHEN 'durchgefuehrt'::text THEN 5
        ELSE 6
      END
    ), gt.start_zeit DESC NULLS LAST
    LIMIT 1
  ) t ON true;

-- Standard-Grants spiegeln die anderen Views in diesem Schema.
GRANT SELECT ON public.v_gutachten_werte TO authenticated, service_role;
GRANT SELECT ON public.v_faelle_mit_aktuellem_termin TO authenticated, service_role;

COMMIT;
