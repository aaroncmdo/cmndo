-- CMM-47 Cluster B-Statistiken (2026-05-15) — v_claim_full um 17 weitere faelle-Workflow-Spalten
--
-- Für admin/statistiken/page.tsx + admin/faelle/(hub)/page.tsx:
--   • Finanz-Workflow: regulierung_am, regulierung_betrag, gutachten_betrag,
--     gutachten_eingegangen_am, sv_zugewiesen_am
--   • Schadens-Cluster: schadens_ursache, schadens_plz, schadens_ort, schadens_fall_typ
--   • Gegner-Stats: gegner_anzahl_beteiligte, gegner_fahrzeugtyp
--   • Fall-Metadata: organisation_id, fahrzeug_typ, dispatch_id, kunde_id, ist_aktiv, deaktiviert_grund
--
-- Pre-Check via information_schema (Memory `feedback_information_schema_check`):
--   alle 17 Spalten existieren in faelle, KEINE in claims — workflow-only.
--
-- Pattern: DROP + CREATE (Postgres REPLACE schlägt bei neuen Spalten am Ende fehl).
-- Diese View ist ein Superset der Mig 1+2+3 (20260514234402 + 20260515095400 +
-- 20260515101308) — bei db push wird sie als letzte erneut erstellt mit allen
-- 35 zusätzlichen Workflow-Spalten.

BEGIN;

DROP VIEW IF EXISTS public.v_claim_full;

CREATE VIEW public.v_claim_full AS
SELECT
  c.id, c.vehicle_id, c.schadentag, c.schadenzeit, c.entdeckt_am,
  c.schadenort_adresse, c.schadenort_plz, c.schadenort_ort, c.schadenort_land,
  c.schadenort_lat, c.schadenort_lng, c.schadenort_kategorie,
  c.hergang_kunde_text, c.hergang_sv_text,
  c.schadenart, c.fall_typ, c.unfall_konstellation, c.fahrerflucht,
  c.auslandskennzeichen, c.polizei_aktenzeichen, c.polizei_bericht_vorhanden,
  c.polizei_vor_ort, c.polizeibericht_status,
  c.geschaedigter_user_id, c.gegnerisches_vehicle_id,
  c.gegner_versicherung_id, c.gegner_versicherungsnummer, c.gegner_aktenzeichen,
  c.gegner_bekannt, c.anzahl_beteiligte_total,
  c.hat_personenschaden, c.hat_mietwagen, c.hat_nutzungsausfall,
  c.hat_sachschaden, c.hat_abschleppung, c.sachschaden_beschreibung,
  c.halter_ungleich_fahrer, c.kunden_konstellation,
  c.unfallskizze_url, c.unfallskizze_svg, c.unfallskizze_bestaetigt,
  c.unfallskizze_ablehnung_grund, c.unfallskizze_generiert_am,
  c.status, c.abgeschlossen_am, c.verjaehrt_am,
  c.created_at, c.updated_at, c.created_by_user_id, c.created_via,
  c.claim_nummer, c.lead_id, c.kundenbetreuer_id, c.phase,
  c.vs_ablehnungs_grund, c.regulierungs_betrag,
  c.endzustand_gesetzt_durch_user_id, c.endzustand_gesetzt_am, c.endzustand_grund,
  c.kanzlei_wunsch, c.kanzlei_wunsch_gefragt_am, c.kanzlei_wunsch_gefragt_in_phase,
  f.id AS fall_id, f.fall_nummer, f.sv_id, f.service_typ,
  -- CMM-47 A.1+A.2 Workflow-Spalten (Migration 20260514234402)
  f.status AS fall_status, f.created_at AS fall_created_at, f.updated_at AS fall_updated_at,
  f.kundenbetreuer_fallback_flag, f.aktuelle_phase, f.szenario,
  f.dokumente_vollstaendig_fuer_phase, f.dokumente_reminder_whatsapp_letzte_sendung,
  f.no_show_gemeldet_am, f.re_termin_token, f.sa_unterschrieben_am,
  f.vollmacht_signiert_am, f.mandatsnummer,
  -- CMM-47 A.3 (Migration 20260515095400)
  f.re_termin_token_eingelaufen_am, f.re_termin_eskalation_an_kb_am,
  f.storniert_am, f.anschlussschreiben_am, f.vs_eskalationsstufe,
  -- CMM-47 B-Rest (Migration 20260515101308)
  f.kennzeichen, f.fahrzeug_hersteller, f.fahrzeug_modell, f.fahrzeug_typ,
  f.sa_unterschrieben,
  -- CMM-47 B-Statistiken (diese Migration)
  f.regulierung_am, f.regulierung_betrag,
  f.gutachten_betrag, f.gutachten_eingegangen_am, f.sv_zugewiesen_am,
  f.schadens_ursache, f.schadens_plz, f.schadens_ort, f.schadens_fall_typ,
  f.gegner_anzahl_beteiligte, f.gegner_fahrzeugtyp,
  f.organisation_id, f.dispatch_id,
  f.kunde_id, f.ist_aktiv, f.deaktiviert_grund,
  COALESCE((SELECT jsonb_agg(to_jsonb(cp.*) ORDER BY cp.reihenfolge, cp.created_at) FROM claim_parties cp WHERE cp.claim_id = c.id), '[]'::jsonb) AS parties,
  COALESCE((SELECT jsonb_agg(to_jsonb(cvi.*) ORDER BY cvi.reihenfolge, cvi.created_at) FROM claim_vehicle_involvements cvi WHERE cvi.claim_id = c.id), '[]'::jsonb) AS vehicle_involvements,
  COALESCE((SELECT jsonb_agg(to_jsonb(cp2.*) ORDER BY cp2.created_at) FROM claim_payments cp2 WHERE cp2.claim_id = c.id), '[]'::jsonb) AS payments,
  COALESCE((SELECT jsonb_agg(to_jsonb(cm.*) ORDER BY cm.created_at) FROM claim_mietwagen cm WHERE cm.claim_id = c.id), '[]'::jsonb) AS mietwagen,
  COALESCE((SELECT jsonb_agg(to_jsonb(vk.*) ORDER BY vk.datum) FROM vs_korrespondenz vk WHERE vk.claim_id = c.id), '[]'::jsonb) AS vs_korrespondenz,
  COALESCE((SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at) FROM repairs r WHERE r.claim_id = c.id), '[]'::jsonb) AS repairs
FROM claims c
LEFT JOIN faelle f ON f.claim_id = c.id;

COMMIT;
