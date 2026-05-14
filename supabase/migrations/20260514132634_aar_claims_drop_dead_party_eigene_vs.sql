-- AAR-Stufe-0 (claims-Tabelle, 14.05.2026)
-- Drop von 4 toten Spalten nach Vertikal-Audit
-- (docs/14.05.2026/leads-konsolidierung-audit/CLAIMS-VERTIKAL-AUDIT.md).
--
-- Vorab-Verifikation:
--   - geschaedigter_party_id, verursacher_party_id: 0/11 Coverage,
--     kein Writer im Code, keine Trigger-Referenz. Lebt in claim_parties.
--   - eigene_versicherung, eigene_policennr: 0/11 Coverage, Reads gehen
--     ausschliesslich auf leads.eigene_* via fall.lead_id (siehe
--     StammdatenReadSection.tsx, StammdatenCard.tsx). claims-Spalten
--     waren Schema-Vorbereitung (Migration 20260504205847), nie befuellt.
--
-- Mit-Drop: zwei FK-Indizes auf den party_id-Spalten + recreate des
-- v_claim_full-Views ohne die 2 party_id-Spalten (vorher referenziert,
-- aber kein Live-Konsument greift selektiv darauf zu — nur als Teil von
-- SELECT * aus der View).

BEGIN;

DROP INDEX IF EXISTS public.idx_claims_geschaedigter_party_id;
DROP INDEX IF EXISTS public.idx_claims_verursacher_party_id;

DROP VIEW IF EXISTS public.v_claim_full;

ALTER TABLE public.claims DROP COLUMN IF EXISTS geschaedigter_party_id;
ALTER TABLE public.claims DROP COLUMN IF EXISTS verursacher_party_id;
ALTER TABLE public.claims DROP COLUMN IF EXISTS eigene_versicherung;
ALTER TABLE public.claims DROP COLUMN IF EXISTS eigene_policennr;

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
  c.ursache,
  c.unfall_konstellation,
  c.fahrerflucht,
  c.auslandskennzeichen,
  c.polizei_aktenzeichen,
  c.polizei_bericht_vorhanden,
  c.polizei_vor_ort,
  c.polizeibericht_status,
  c.bkat_unfallart,
  c.geschaedigter_user_id,
  c.verursacher_user_id,
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

COMMIT;
