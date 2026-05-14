-- AAR-Stufe-0-Final (claims-Tabelle, 14.05.2026)
-- Drop von 3 ungenutzten/halb-genutzten Spalten nach Vertikal-Audit
-- (docs/14.05.2026/leads-konsolidierung-audit/CLAIMS-VERTIKAL-AUDIT.md +
--  docs/superpowers/specs/2026-05-14-stufe-0-final-claims-drops-design.md).
--
-- Vorab-Verifikation:
--   - verursacher_user_id: 0/11 Coverage, kein Writer im Code, einzige
--     Live-Referenz war 1 RLS-Policy (`claims_kunde_sv_dispatch_select_consolidated`,
--     Migration 20260513164821). Use-Case "Verursacher mit Account sieht
--     eigenen Claim" wird ueber claim_parties.user_id + is_claim_user_party()
--     abgedeckt — der user_id-Cache auf claims wurde nie genutzt.
--   - ursache: 0/11 Coverage, einziger Writer war create-for-fall.ts
--     (Kopie von source.schadens_ursache), einziger Reader war der
--     Stammdaten-Schema-Fallback aus PR #1142 (Rueckbau im Code-Patch).
--     faelle.schadens_ursache bleibt Single-Source.
--   - bkat_unfallart: 0/11 Coverage, 2 Convert-Writer kopieren
--     lead.bkat_unfallart, kein Reader auf claims (alle UI-Reader lesen
--     leads/faelle).
--
-- Phase 1: RLS-Policy-Patch — verursacher_user_id-Klausel raus.
-- Phase 2: DROP COLUMN x3.
-- Phase 3: View-Recreate (v_claim_full + v_claim_for_gast).

BEGIN;

-- Phase 1 — RLS: claims_kunde_sv_dispatch_select_consolidated ohne verursacher_user_id
-- Quelle: 20260513164821_aar_claims_policy_consolidation.sql

DROP POLICY IF EXISTS "claims_kunde_sv_dispatch_select_consolidated" ON public.claims;

CREATE POLICY "claims_kunde_sv_dispatch_select_consolidated" ON public.claims
  FOR SELECT TO public
  USING (
    (public.is_dispatcher() AND public.dispatcher_owns_lead(lead_id))
    OR geschaedigter_user_id = (SELECT auth.uid())
    OR public.is_claim_user_party(id)
    OR public.is_sv_for_claim(id)
  );

-- Phase 2 — DROP COLUMN
-- v_claim_full referenziert ursache, verursacher_user_id, bkat_unfallart
-- (Migration 20260514132634, Zeilen 48/56/58). View muss vorher droppen.
-- v_claim_for_gast referenziert bkat_unfallart (Migration 20260425170200,
-- Zeile 22). Auch droppen.

DROP VIEW IF EXISTS public.v_claim_full;
DROP VIEW IF EXISTS public.v_claim_for_gast;

ALTER TABLE public.claims DROP COLUMN IF EXISTS verursacher_user_id;
ALTER TABLE public.claims DROP COLUMN IF EXISTS ursache;
ALTER TABLE public.claims DROP COLUMN IF EXISTS bkat_unfallart;

-- Phase 3 — Views recreate ohne die 3 Spalten

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
