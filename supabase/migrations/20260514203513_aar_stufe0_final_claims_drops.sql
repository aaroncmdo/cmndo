-- AAR-Stufe-0-Final (claims-Tabelle, 14.05.2026)
-- Drop von 3 ungenutzten/halb-genutzten Spalten nach Vertikal-Audit
-- (docs/14.05.2026/leads-konsolidierung-audit/CLAIMS-VERTIKAL-AUDIT.md +
--  docs/superpowers/specs/2026-05-14-stufe-0-final-claims-drops-design.md).
--
-- Vorab-Verifikation:
--   - verursacher_user_id: 0/11 Coverage, kein Writer im Code, einzige
--     Live-Referenz war 1 RLS-Policy (`claims_kunde_sv_dispatch_select_consolidated`,
--     Migration 20260513164821).
--   - ursache: 0/11 Coverage, einziger Writer war create-for-fall.ts,
--     einziger Reader war Stammdaten-Schema-Fallback aus PR #1142 (rueckgebaut).
--   - bkat_unfallart: 0/11 Coverage, 2 Convert-Writer kopierten lead.bkat_unfallart,
--     im Sync-Trigger (Stufe-0.5-Stand) noch als Sync-Spalte aufgefuehrt.
--
-- Phase 1: RLS-Policy-Patch — verursacher_user_id-Klausel raus.
-- Phase 2a: Sync-Trigger-Funktionen ohne bkat_unfallart neu (CREATE OR REPLACE)
--           — analog Stufe-0.5 firma_name-Patch (Migration 20260514142739).
-- Phase 2b: Trigger neu erzeugen ohne bkat_unfallart in UPDATE-OF-Liste.
-- Phase 2c: Views droppen, DROP COLUMN x3, Views ohne die 3 Spalten neu.

BEGIN;

-- =====================================================================
-- Phase 1 — RLS: claims_kunde_sv_dispatch_select_consolidated ohne
-- verursacher_user_id (Quelle: 20260513164821).
-- =====================================================================

DROP POLICY IF EXISTS "claims_kunde_sv_dispatch_select_consolidated" ON public.claims;

CREATE POLICY "claims_kunde_sv_dispatch_select_consolidated" ON public.claims
  FOR SELECT TO public
  USING (
    (public.is_dispatcher() AND public.dispatcher_owns_lead(lead_id))
    OR geschaedigter_user_id = (SELECT auth.uid())
    OR public.is_claim_user_party(id)
    OR public.is_sv_for_claim(id)
  );

-- =====================================================================
-- Phase 2a — Sync-Trigger-Funktionen ohne bkat_unfallart neu.
-- Basis: Stufe-0.5-Stand aus 20260514142739 — alle Zeilen 1:1 uebernommen
-- ausser den drei bkat_unfallart-Referenzen (Zeilen 32+95+143 vom Original).
-- =====================================================================

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

-- =====================================================================
-- Phase 2b — Trigger neu erzeugen ohne bkat_unfallart in UPDATE-OF-Liste.
-- =====================================================================

DROP TRIGGER IF EXISTS trg_sync_claims_to_faelle ON public.claims;
CREATE TRIGGER trg_sync_claims_to_faelle
  AFTER UPDATE OF
    abgeschlossen_am, auslandskennzeichen, brn, fahrerflucht,
    finanzierung_leasing, finanzierungsgeber_adresse, finanzierungsgeber_name,
    finanzierungsgeber_vertragsnr, gegner_bekannt, gegner_versicherung_id,
    gegner_versicherungsnummer, gewerbe_flag, kanzlei_ansprechpartner_email,
    kanzlei_ansprechpartner_name, kanzlei_ansprechpartner_telefon,
    kanzlei_uebergeben_am, kunde_email, kunden_konstellation, kundenbetreuer_id,
    nutzungsausfall_tage, polizei_aktenzeichen, polizei_bericht_vorhanden,
    polizei_vor_ort, polizeibericht_status, restwert, sachschaden_beschreibung,
    spezifikation, totalschaden, unfall_konstellation,
    unfallskizze_ablehnung_grund, unfallskizze_bestaetigt,
    unfallskizze_generiert_am, unfallskizze_svg, unfallskizze_url, vehicle_id,
    vorsteuerabzugsberechtigt, wiederbeschaffungswert, zeugen_kontakte
  ON public.claims
  FOR EACH ROW EXECUTE FUNCTION sync_claims_to_faelle();

-- trg_sync_faelle_to_claims bleibt unveraendert (faelle.bkat_unfallart
-- existiert weiter — UI-Pfade lesen es; Trigger feuert weiter bei
-- faelle.bkat_unfallart-Updates, aber sync_faelle_to_claims schreibt
-- es jetzt nicht mehr auf claims).

-- =====================================================================
-- Phase 2c — DROP COLUMN x3 + Views nachfahren.
-- v_claim_full referenziert ursache, verursacher_user_id, bkat_unfallart.
-- v_claim_for_gast referenziert bkat_unfallart.
-- =====================================================================

DROP VIEW IF EXISTS public.v_claim_full;
DROP VIEW IF EXISTS public.v_claim_for_gast;

ALTER TABLE public.claims DROP COLUMN IF EXISTS verursacher_user_id;
ALTER TABLE public.claims DROP COLUMN IF EXISTS ursache;
ALTER TABLE public.claims DROP COLUMN IF EXISTS bkat_unfallart;

-- =====================================================================
-- Phase 3 — Views recreate ohne die 3 Spalten.
-- v_claim_full analog Stufe-0-Recreate (20260514132634), v_claim_for_gast
-- analog Original (20260425170200) ohne bkat_unfallart.
-- =====================================================================

CREATE VIEW public.v_claim_full AS
SELECT
  c.id,
  c.vehicle_id,
  c.schadentag,
  c.schadenzeit,
  c.entdeckt_am,
  c.schadenort_adresse,
  c.schadenort_plz,
  c.schadenort_ort,
  c.schadenort_land,
  c.schadenort_lat,
  c.schadenort_lng,
  c.schadenort_kategorie,
  c.hergang_kunde_text,
  c.hergang_sv_text,
  c.schadenart,
  c.fall_typ,
  c.unfall_konstellation,
  c.fahrerflucht,
  c.auslandskennzeichen,
  c.polizei_aktenzeichen,
  c.polizei_bericht_vorhanden,
  c.polizei_vor_ort,
  c.polizeibericht_status,
  c.geschaedigter_user_id,
  c.gegnerisches_vehicle_id,
  c.gegner_versicherung_id,
  c.gegner_versicherungsnummer,
  c.gegner_aktenzeichen,
  c.gegner_bekannt,
  c.anzahl_beteiligte_total,
  c.hat_personenschaden,
  c.hat_mietwagen,
  c.hat_nutzungsausfall,
  c.hat_sachschaden,
  c.hat_abschleppung,
  c.sachschaden_beschreibung,
  c.halter_ungleich_fahrer,
  c.kunden_konstellation,
  c.unfallskizze_url,
  c.unfallskizze_svg,
  c.unfallskizze_bestaetigt,
  c.unfallskizze_ablehnung_grund,
  c.unfallskizze_generiert_am,
  c.status,
  c.abgeschlossen_am,
  c.verjaehrt_am,
  c.created_at,
  c.updated_at,
  c.created_by_user_id,
  c.created_via,
  c.claim_nummer,
  c.lead_id,
  c.kundenbetreuer_id,
  c.phase,
  c.vs_ablehnungs_grund,
  c.regulierungs_betrag,
  c.endzustand_gesetzt_durch_user_id,
  c.endzustand_gesetzt_am,
  c.endzustand_grund,
  c.kanzlei_wunsch,
  c.kanzlei_wunsch_gefragt_am,
  c.kanzlei_wunsch_gefragt_in_phase,
  f.id AS fall_id,
  f.fall_nummer,
  f.sv_id,
  f.service_typ,
  COALESCE((
    SELECT jsonb_agg(to_jsonb(cp.*) ORDER BY cp.reihenfolge, cp.created_at)
    FROM claim_parties cp
    WHERE cp.claim_id = c.id
  ), '[]'::jsonb) AS parties,
  COALESCE((
    SELECT jsonb_agg(to_jsonb(cvi.*) ORDER BY cvi.reihenfolge, cvi.created_at)
    FROM claim_vehicle_involvements cvi
    WHERE cvi.claim_id = c.id
  ), '[]'::jsonb) AS vehicle_involvements,
  COALESCE((
    SELECT jsonb_agg(to_jsonb(cp2.*) ORDER BY cp2.created_at)
    FROM claim_payments cp2
    WHERE cp2.claim_id = c.id
  ), '[]'::jsonb) AS payments,
  COALESCE((
    SELECT jsonb_agg(to_jsonb(cm.*) ORDER BY cm.created_at)
    FROM claim_mietwagen cm
    WHERE cm.claim_id = c.id
  ), '[]'::jsonb) AS mietwagen,
  COALESCE((
    SELECT jsonb_agg(to_jsonb(vk.*) ORDER BY vk.datum)
    FROM vs_korrespondenz vk
    WHERE vk.claim_id = c.id
  ), '[]'::jsonb) AS vs_korrespondenz,
  COALESCE((
    SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at)
    FROM repairs r
    WHERE r.claim_id = c.id
  ), '[]'::jsonb) AS repairs
FROM claims c
LEFT JOIN faelle f ON f.claim_id = c.id;

CREATE VIEW public.v_claim_for_gast
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.schadentag,
  c.schadenzeit,
  c.schadenort_ort,
  c.schadenort_plz,
  c.schadenort_land,
  c.schadenort_kategorie,
  c.hergang_kunde_text,
  c.schadenart,
  c.unfall_konstellation,
  c.fahrerflucht,
  c.polizei_aktenzeichen,
  c.polizei_bericht_vorhanden,
  c.gegner_versicherung_id,
  c.hat_personenschaden,
  c.hat_mietwagen,
  c.unfallskizze_url,
  c.unfallskizze_svg,
  c.status,
  c.created_at,
  c.updated_at
  -- NICHT exposed: geschaedigter_user_id (Privacy),
  --   gegner_aktenzeichen, gegner_versicherungsnummer (Tanners Daten),
  --   hergang_sv_text (interne SV-Reformulierung),
  --   created_via, created_by_user_id (interne Audit-Daten)
FROM public.claims c
WHERE
  EXISTS (
    SELECT 1 FROM public.claim_parties cp
    WHERE cp.claim_id = c.id
      AND cp.user_id = auth.uid()
      AND cp.ist_aktiv = TRUE
  );

COMMENT ON VIEW public.v_claim_for_gast IS
  'AAR-810 A.3 / Stufe-0-Final: Limitierte claim-Sicht fuer Gast-Accounts und alle Beteiligten. Zeigt oeffentliche claim-Daten ohne interne Felder (gegner_aktenzeichen, hergang_sv_text, etc.).';

GRANT SELECT ON public.v_claim_for_gast TO authenticated;

COMMIT;
