-- Fix kritischer Data-Loss-Bug in den 40-Spalten-Sync-Triggern
-- (sync_faelle_to_claims + sync_claims_to_faelle, CMM-Phase-1.5 PR #491).
--
-- Bug-Mechanik (Smoke-Reproduktion 13.05.2026):
--   Beide Trigger-Funktionen haben unconditional `SET col = NEW.col` fuer
--   alle 40 sync-Spalten gemacht. Wenn beide Tabellen fuer eine Spalte
--   divergente Werte hatten (z.B. claims.restwert=1200, faelle.restwert=NULL),
--   dann hat das UPDATE einer beliebigen anderen sync-Spalte alle 40
--   NEW-Werte zur Gegenseite kopiert — inklusive der NULLs aus der „leereren"
--   Seite. Folge: claim-OCR-Werte (Claude-Pipeline schreibt nur claims)
--   wurden silent geloescht sobald irgendwer ein faelle-Feld in der UI
--   editiert hat (z.B. MietwagenEditCard, InlineEditField on-blur).
--
-- Repro-Beleg (SQL gegen Test-Fixture aaaa2222/aaaa3333):
--   Pre: claims.restwert=1200, faelle.restwert=NULL
--   UPDATE faelle SET nutzungsausfall_tage=14;
--   Post: claims.restwert=NULL  (verloren — Bug!)
--
-- Fix:
--   Pro Spalte CASE WHEN NEW.col IS DISTINCT FROM OLD.col THEN NEW.col
--   ELSE <target_table>.col END.
--   Damit propagiert nur die explizit geaenderte Spalte; alle anderen
--   bleiben auf der Gegenseite unangetastet. IS DISTINCT FROM behandelt
--   NULL-vs-Wert korrekt (unlike `=`).
--
-- pg_trigger_depth() > 1 Guard bleibt — verhindert Bouncing zwischen den
-- beiden Triggern. claim_id-Check bleibt — Faelle ohne claim_id sind kein
-- Sync-Target.

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
    bkat_unfallart = CASE WHEN NEW.bkat_unfallart IS DISTINCT FROM OLD.bkat_unfallart THEN NEW.bkat_unfallart::text ELSE c.bkat_unfallart END,
    brn = CASE WHEN NEW.brn IS DISTINCT FROM OLD.brn THEN NEW.brn ELSE c.brn END,
    fahrerflucht = CASE WHEN NEW.fahrerflucht IS DISTINCT FROM OLD.fahrerflucht THEN NEW.fahrerflucht ELSE c.fahrerflucht END,
    finanzierung_leasing = CASE WHEN NEW.finanzierung_leasing IS DISTINCT FROM OLD.finanzierung_leasing THEN NEW.finanzierung_leasing ELSE c.finanzierung_leasing END,
    finanzierungsgeber_adresse = CASE WHEN NEW.finanzierungsgeber_adresse IS DISTINCT FROM OLD.finanzierungsgeber_adresse THEN NEW.finanzierungsgeber_adresse ELSE c.finanzierungsgeber_adresse END,
    finanzierungsgeber_name = CASE WHEN NEW.finanzierungsgeber_name IS DISTINCT FROM OLD.finanzierungsgeber_name THEN NEW.finanzierungsgeber_name ELSE c.finanzierungsgeber_name END,
    finanzierungsgeber_vertragsnr = CASE WHEN NEW.finanzierungsgeber_vertragsnr IS DISTINCT FROM OLD.finanzierungsgeber_vertragsnr THEN NEW.finanzierungsgeber_vertragsnr ELSE c.finanzierungsgeber_vertragsnr END,
    firma_name = CASE WHEN NEW.firma_name IS DISTINCT FROM OLD.firma_name THEN NEW.firma_name ELSE c.firma_name END,
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
    nutzungsausfall_tage = CASE WHEN NEW.nutzungsausfall_tage IS DISTINCT FROM OLD.nutzungsausfall_tage THEN NEW.nutzungsausfall_tage ELSE c.nutzungsausfall_tage END,
    polizei_aktenzeichen = CASE WHEN NEW.polizei_aktenzeichen IS DISTINCT FROM OLD.polizei_aktenzeichen THEN NEW.polizei_aktenzeichen ELSE c.polizei_aktenzeichen END,
    polizei_bericht_vorhanden = CASE WHEN NEW.polizei_bericht_vorhanden IS DISTINCT FROM OLD.polizei_bericht_vorhanden THEN NEW.polizei_bericht_vorhanden ELSE c.polizei_bericht_vorhanden END,
    polizei_vor_ort = CASE WHEN NEW.polizei_vor_ort IS DISTINCT FROM OLD.polizei_vor_ort THEN NEW.polizei_vor_ort ELSE c.polizei_vor_ort END,
    polizeibericht_status = CASE WHEN NEW.polizeibericht_status IS DISTINCT FROM OLD.polizeibericht_status THEN NEW.polizeibericht_status ELSE c.polizeibericht_status END,
    restwert = CASE WHEN NEW.restwert IS DISTINCT FROM OLD.restwert THEN NEW.restwert ELSE c.restwert END,
    sachschaden_beschreibung = CASE WHEN NEW.sachschaden_beschreibung IS DISTINCT FROM OLD.sachschaden_beschreibung THEN NEW.sachschaden_beschreibung ELSE c.sachschaden_beschreibung END,
    spezifikation = CASE WHEN NEW.spezifikation IS DISTINCT FROM OLD.spezifikation THEN NEW.spezifikation ELSE c.spezifikation END,
    totalschaden = CASE WHEN NEW.totalschaden IS DISTINCT FROM OLD.totalschaden THEN NEW.totalschaden ELSE c.totalschaden END,
    unfall_konstellation = CASE WHEN NEW.unfall_konstellation IS DISTINCT FROM OLD.unfall_konstellation THEN NEW.unfall_konstellation ELSE c.unfall_konstellation END,
    unfallskizze_ablehnung_grund = CASE WHEN NEW.unfallskizze_ablehnung_grund IS DISTINCT FROM OLD.unfallskizze_ablehnung_grund THEN NEW.unfallskizze_ablehnung_grund ELSE c.unfallskizze_ablehnung_grund END,
    unfallskizze_bestaetigt = CASE WHEN NEW.unfallskizze_bestaetigt IS DISTINCT FROM OLD.unfallskizze_bestaetigt THEN NEW.unfallskizze_bestaetigt ELSE c.unfallskizze_bestaetigt END,
    unfallskizze_generiert_am = CASE WHEN NEW.unfallskizze_generiert_am IS DISTINCT FROM OLD.unfallskizze_generiert_am THEN NEW.unfallskizze_generiert_am ELSE c.unfallskizze_generiert_am END,
    unfallskizze_svg = CASE WHEN NEW.unfallskizze_svg IS DISTINCT FROM OLD.unfallskizze_svg THEN NEW.unfallskizze_svg ELSE c.unfallskizze_svg END,
    unfallskizze_url = CASE WHEN NEW.unfallskizze_url IS DISTINCT FROM OLD.unfallskizze_url THEN NEW.unfallskizze_url ELSE c.unfallskizze_url END,
    vehicle_id = CASE WHEN NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN NEW.vehicle_id ELSE c.vehicle_id END,
    vorsteuerabzugsberechtigt = CASE WHEN NEW.vorsteuerabzugsberechtigt IS DISTINCT FROM OLD.vorsteuerabzugsberechtigt THEN NEW.vorsteuerabzugsberechtigt ELSE c.vorsteuerabzugsberechtigt END,
    wiederbeschaffungswert = CASE WHEN NEW.wiederbeschaffungswert IS DISTINCT FROM OLD.wiederbeschaffungswert THEN NEW.wiederbeschaffungswert ELSE c.wiederbeschaffungswert END,
    zeugen_kontakte = CASE WHEN NEW.zeugen_kontakte IS DISTINCT FROM OLD.zeugen_kontakte THEN NEW.zeugen_kontakte ELSE c.zeugen_kontakte END,
    updated_at = NOW()
  WHERE c.id = NEW.claim_id;

  RETURN NEW;
END;
$function$;

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
    bkat_unfallart = CASE WHEN NEW.bkat_unfallart IS DISTINCT FROM OLD.bkat_unfallart THEN NEW.bkat_unfallart::public.bkat_unfallart ELSE f.bkat_unfallart END,
    brn = CASE WHEN NEW.brn IS DISTINCT FROM OLD.brn THEN NEW.brn ELSE f.brn END,
    fahrerflucht = CASE WHEN NEW.fahrerflucht IS DISTINCT FROM OLD.fahrerflucht THEN NEW.fahrerflucht ELSE f.fahrerflucht END,
    finanzierung_leasing = CASE WHEN NEW.finanzierung_leasing IS DISTINCT FROM OLD.finanzierung_leasing THEN NEW.finanzierung_leasing ELSE f.finanzierung_leasing END,
    finanzierungsgeber_adresse = CASE WHEN NEW.finanzierungsgeber_adresse IS DISTINCT FROM OLD.finanzierungsgeber_adresse THEN NEW.finanzierungsgeber_adresse ELSE f.finanzierungsgeber_adresse END,
    finanzierungsgeber_name = CASE WHEN NEW.finanzierungsgeber_name IS DISTINCT FROM OLD.finanzierungsgeber_name THEN NEW.finanzierungsgeber_name ELSE f.finanzierungsgeber_name END,
    finanzierungsgeber_vertragsnr = CASE WHEN NEW.finanzierungsgeber_vertragsnr IS DISTINCT FROM OLD.finanzierungsgeber_vertragsnr THEN NEW.finanzierungsgeber_vertragsnr ELSE f.finanzierungsgeber_vertragsnr END,
    firma_name = CASE WHEN NEW.firma_name IS DISTINCT FROM OLD.firma_name THEN NEW.firma_name ELSE f.firma_name END,
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
    nutzungsausfall_tage = CASE WHEN NEW.nutzungsausfall_tage IS DISTINCT FROM OLD.nutzungsausfall_tage THEN NEW.nutzungsausfall_tage ELSE f.nutzungsausfall_tage END,
    polizei_aktenzeichen = CASE WHEN NEW.polizei_aktenzeichen IS DISTINCT FROM OLD.polizei_aktenzeichen THEN NEW.polizei_aktenzeichen ELSE f.polizei_aktenzeichen END,
    polizei_bericht_vorhanden = CASE WHEN NEW.polizei_bericht_vorhanden IS DISTINCT FROM OLD.polizei_bericht_vorhanden THEN NEW.polizei_bericht_vorhanden ELSE f.polizei_bericht_vorhanden END,
    polizei_vor_ort = CASE WHEN NEW.polizei_vor_ort IS DISTINCT FROM OLD.polizei_vor_ort THEN NEW.polizei_vor_ort ELSE f.polizei_vor_ort END,
    polizeibericht_status = CASE WHEN NEW.polizeibericht_status IS DISTINCT FROM OLD.polizeibericht_status THEN NEW.polizeibericht_status ELSE f.polizeibericht_status END,
    restwert = CASE WHEN NEW.restwert IS DISTINCT FROM OLD.restwert THEN NEW.restwert ELSE f.restwert END,
    sachschaden_beschreibung = CASE WHEN NEW.sachschaden_beschreibung IS DISTINCT FROM OLD.sachschaden_beschreibung THEN NEW.sachschaden_beschreibung ELSE f.sachschaden_beschreibung END,
    spezifikation = CASE WHEN NEW.spezifikation IS DISTINCT FROM OLD.spezifikation THEN NEW.spezifikation ELSE f.spezifikation END,
    totalschaden = CASE WHEN NEW.totalschaden IS DISTINCT FROM OLD.totalschaden THEN NEW.totalschaden ELSE f.totalschaden END,
    unfall_konstellation = CASE WHEN NEW.unfall_konstellation IS DISTINCT FROM OLD.unfall_konstellation THEN NEW.unfall_konstellation ELSE f.unfall_konstellation END,
    unfallskizze_ablehnung_grund = CASE WHEN NEW.unfallskizze_ablehnung_grund IS DISTINCT FROM OLD.unfallskizze_ablehnung_grund THEN NEW.unfallskizze_ablehnung_grund ELSE f.unfallskizze_ablehnung_grund END,
    unfallskizze_bestaetigt = CASE WHEN NEW.unfallskizze_bestaetigt IS DISTINCT FROM OLD.unfallskizze_bestaetigt THEN NEW.unfallskizze_bestaetigt ELSE f.unfallskizze_bestaetigt END,
    unfallskizze_generiert_am = CASE WHEN NEW.unfallskizze_generiert_am IS DISTINCT FROM OLD.unfallskizze_generiert_am THEN NEW.unfallskizze_generiert_am ELSE f.unfallskizze_generiert_am END,
    unfallskizze_svg = CASE WHEN NEW.unfallskizze_svg IS DISTINCT FROM OLD.unfallskizze_svg THEN NEW.unfallskizze_svg ELSE f.unfallskizze_svg END,
    unfallskizze_url = CASE WHEN NEW.unfallskizze_url IS DISTINCT FROM OLD.unfallskizze_url THEN NEW.unfallskizze_url ELSE f.unfallskizze_url END,
    vehicle_id = CASE WHEN NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN NEW.vehicle_id ELSE f.vehicle_id END,
    vorsteuerabzugsberechtigt = CASE WHEN NEW.vorsteuerabzugsberechtigt IS DISTINCT FROM OLD.vorsteuerabzugsberechtigt THEN NEW.vorsteuerabzugsberechtigt ELSE f.vorsteuerabzugsberechtigt END,
    wiederbeschaffungswert = CASE WHEN NEW.wiederbeschaffungswert IS DISTINCT FROM OLD.wiederbeschaffungswert THEN NEW.wiederbeschaffungswert ELSE f.wiederbeschaffungswert END,
    zeugen_kontakte = CASE WHEN NEW.zeugen_kontakte IS DISTINCT FROM OLD.zeugen_kontakte THEN NEW.zeugen_kontakte ELSE f.zeugen_kontakte END,
    updated_at = NOW()
  WHERE f.claim_id = NEW.id;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.sync_faelle_to_claims() IS
  'CMM-Phase-1.5 Sync-Trigger faelle->claims. Fix 13.05.2026: pro Spalte CASE WHEN IS DISTINCT FROM, statt unconditional NEW.col-Copy. Verhindert Data-Loss wenn beide Tabellen divergieren.';

COMMENT ON FUNCTION public.sync_claims_to_faelle() IS
  'CMM-Phase-1.5 Sync-Trigger claims->faelle. Fix 13.05.2026: pro Spalte CASE WHEN IS DISTINCT FROM, statt unconditional NEW.col-Copy. Verhindert Data-Loss wenn beide Tabellen divergieren.';
