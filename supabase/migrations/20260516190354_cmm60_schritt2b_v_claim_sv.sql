-- CMM-60 Schritt 2b — SV-Claim-Projektion v_claim_sv.
--
-- Der SV bearbeitet den Auftrag-Lifecycle eines Claims, nicht den
-- Kanzleifall-LC. Die claims-SELECT-Policy gibt ihm heute die ganze Zeile
-- inkl. kanzlei_*/regulierungs_betrag. Dieser View ist das spalten-
-- gescopete Phase-4-Lese-Ziel: 61-Spalten-Whitelist (Auftrag-LC + neutrale
-- Stammdaten), Row-Filter is_sv_for_claim, security_invoker.
--
-- Spec: docs/superpowers/specs/2026-05-16-cmm60-schritt2b-sv-claim-projektion-design.md
-- NICHT in Scope: Entzug der direkten claims-SELECT des SV + Reader-
-- Umstellung — das ist Phase 4.

BEGIN;

CREATE OR REPLACE VIEW public.v_claim_sv
WITH (security_invoker = true)
AS
  SELECT
    c.id, c.claim_nummer, c.status, c.phase, c.fall_typ,
    c.abgeschlossen_am, c.anzahl_beteiligte_total, c.auslandskennzeichen,
    c.brn, c.created_at, c.entdeckt_am, c.fahrerflucht,
    c.finanzierung_leasing, c.gegner_aktenzeichen, c.gegner_bekannt,
    c.gegner_versicherung_id, c.gegner_versicherungsnummer,
    c.gegnerisches_vehicle_id, c.gewerbe_flag, c.halter_ungleich_fahrer,
    c.hat_abschleppung, c.hat_mietwagen, c.hat_nutzungsausfall,
    c.hat_personenschaden, c.hat_sachschaden, c.hergang_kunde_text,
    c.hergang_sv_text, c.kunde_no_show_count, c.kunden_konstellation,
    c.kundenbetreuer_id, c.letzter_no_show_am, c.letzter_sv_no_show_am,
    c.polizei_aktenzeichen, c.polizei_bericht_vorhanden, c.polizei_vor_ort,
    c.polizeibericht_status, c.sachschaden_beschreibung, c.schadenart,
    c.schadenort_adresse, c.schadenort_kategorie, c.schadenort_land,
    c.schadenort_lat, c.schadenort_lng, c.schadenort_ort, c.schadenort_plz,
    c.schadentag, c.schadenzeit, c.spezifikation, c.sv_id,
    c.sv_no_show_count, c.unfall_konstellation,
    c.unfallskizze_ablehnung_grund, c.unfallskizze_bestaetigt,
    c.unfallskizze_generiert_am, c.unfallskizze_svg, c.unfallskizze_url,
    c.updated_at, c.vehicle_id, c.vorschaden_mit_vs_abgerechnet,
    c.vorsteuerabzugsberechtigt, c.zeugen_kontakte
  FROM public.claims c
  WHERE public.is_sv_for_claim(c.id);

COMMENT ON VIEW public.v_claim_sv IS
  'CMM-60 Schritt 2b: SV-gescopete Claim-Projektion. Spalten-Whitelist auf Auftrag-Lifecycle + neutrale Stammdaten — ohne Kanzleifall-LC, Regulierung, internen Audit, kunde_email. Row-Filter is_sv_for_claim. Phase-4-Ziel der SV-Reader-Migration.';

GRANT SELECT ON public.v_claim_sv TO authenticated;

COMMIT;
