-- Slice 2 (claims Normalisierung / CMM-49) -- T1 shape-preserving view rewrite.
-- Releases v_claim_sv's dependency on claims.letzter_no_show_am / letzter_sv_no_show_am
-- by substituting NULL::timestamptz for both projections. The view keeps its exact
-- 60-column shape (same order + types, security_invoker=false preserved), so any
-- v_claim_sv reader is byte-identically unaffected. The DROP COLUMN follows in
-- 20260710160800_claims_drop_letzter_no_show_columns.sql.
-- Both columns are dead denorm no-show timestamps: 0 data, 0 code, 0 function, 0 policy
-- (DB-verified 2026-07-10). Live no-show tracking uses kunde_no_show_count /
-- sv_no_show_count. Applied to prod via apply_migration (Regel 2), tracked version
-- 20260710160507.
CREATE OR REPLACE VIEW public.v_claim_sv
  WITH (security_invoker=false) AS
 SELECT c.id,
    c.claim_nummer,
    c.status,
    c.fall_typ,
    c.abgeschlossen_am,
    c.anzahl_beteiligte_total,
    c.auslandskennzeichen,
    c.brn,
    c.created_at,
    c.entdeckt_am,
    c.fahrerflucht,
    c.finanzierung_leasing,
    vp_g.versicherungs_aktenzeichen AS gegner_aktenzeichen,
    c.gegner_bekannt,
    c.gegner_versicherung_id,
    vp_g.versicherungsnummer AS gegner_versicherungsnummer,
    c.gegnerisches_vehicle_id,
    c.gewerbe_flag,
    c.halter_ungleich_fahrer,
    c.hat_abschleppung,
    c.hat_mietwagen,
    c.hat_nutzungsausfall,
    c.hat_personenschaden,
    c.hat_sachschaden,
    c.hergang_kunde_text,
    c.hergang_sv_text,
    c.kunde_no_show_count,
    c.kunden_konstellation,
    c.kundenbetreuer_id,
    NULL::timestamptz AS letzter_no_show_am,
    NULL::timestamptz AS letzter_sv_no_show_am,
    c.polizei_aktenzeichen,
    c.polizei_bericht_vorhanden,
    c.polizei_vor_ort,
    c.polizeibericht_status,
    c.sachschaden_beschreibung,
    c.schadenart,
    c.schadenort_adresse,
    c.schadenort_kategorie,
    c.schadenort_land,
    c.schadenort_lat,
    c.schadenort_lng,
    c.schadenort_ort,
    c.schadenort_plz,
    c.schadentag,
    c.schadenzeit,
    c.spezifikation,
    c.sv_id,
    c.sv_no_show_count,
    c.unfall_konstellation,
    c.unfallskizze_ablehnung_grund,
    c.unfallskizze_bestaetigt,
    c.unfallskizze_generiert_am,
    c.unfallskizze_svg,
    c.unfallskizze_url,
    c.updated_at,
    c.vehicle_id,
    c.vorschaden_mit_vs_abgerechnet,
    c.vorsteuerabzugsberechtigt,
    c.zeugen_kontakte
   FROM claims c
     LEFT JOIN LATERAL ( SELECT vpp.versicherungsnummer,
            vpp.versicherungs_aktenzeichen
           FROM claim_parties vpp
          WHERE vpp.claim_id = c.id AND vpp.rolle = 'verursacher'::text
          ORDER BY vpp.reihenfolge, vpp.created_at
         LIMIT 1) vp_g ON true
  WHERE is_sv_for_claim(c.id);
