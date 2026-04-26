-- CMM-2 (Phase 0 Foundation): Zwei neue Views als Read-Layer für die
-- claim-as-SSoT-Konsolidierung.
--
-- v_claim_listing  — schmal für Listen / Kanban / Dashboards
-- v_claim_full     — breit, joint claims + alle relevanten Sub-Entities
--                     (parties, vehicle_involvements, payments, mietwagen,
--                      vs_korrespondenz, repairs)
--
-- Beide Views erben die RLS-Policies der Quell-Tabellen (Postgres-Default).
-- Das heißt: ein Kunde sieht über v_claim_full nur die Sub-Entities, die
-- er auch direkt sehen darf. Keine zusätzlichen Policies nötig.
--
-- Performance-Hinweis: v_claim_full nutzt korrelierte jsonb_agg-Subqueries,
-- damit die Sub-Entity-Listen pro Claim nur einmal aggregiert werden.
-- Für Listen NIE v_claim_full verwenden — dafür v_claim_listing.

-- ════════════════════════════════════════════════════════════════════════
-- v_claim_listing — schmal
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_claim_listing AS
SELECT
  c.id                              AS claim_id,
  c.claim_nummer,
  c.phase,
  c.status,
  c.schadentag,
  c.kunden_konstellation,
  c.created_at,
  c.updated_at,
  -- Assignment aus faelle (parallele Row, gleiche id)
  f.fall_nummer,
  f.sv_id,
  f.kundenbetreuer_id              AS faelle_kundenbetreuer_id,
  c.kundenbetreuer_id              AS claim_kundenbetreuer_id,
  f.service_typ,
  -- Kunde-Anzeigename (aus geschaedigter_user_id → profiles)
  p.anzeigename                    AS kunde_anzeigename,
  p.vorname                        AS kunde_vorname,
  p.nachname                       AS kunde_nachname,
  -- Fahrzeug-Kennzeichen (aus vehicles)
  v.kennzeichen_aktuell           AS kennzeichen
FROM claims c
LEFT JOIN faelle f       ON f.id = c.id
LEFT JOIN profiles p     ON p.id = c.geschaedigter_user_id
LEFT JOIN vehicles v     ON v.id = c.vehicle_id;

COMMENT ON VIEW v_claim_listing IS
  'CMM-2: Schmaler Read-View für Listen/Kanban/Dashboards. Pro Claim eine Zeile, '
  'inkl. Assignment-Spalten aus faelle und Kunde-Name aus profiles. RLS via Quell-Tabellen.';

-- ════════════════════════════════════════════════════════════════════════
-- v_claim_full — breit, mit Sub-Entities als jsonb-Arrays
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_claim_full AS
SELECT
  c.*,
  -- Assignment aus faelle (parallele Row, gleiche id)
  f.fall_nummer,
  f.sv_id,
  f.service_typ,
  -- Sub-Entities als jsonb_agg
  COALESCE(
    (SELECT jsonb_agg(to_jsonb(cp.*) ORDER BY cp.reihenfolge NULLS LAST, cp.created_at)
     FROM claim_parties cp WHERE cp.claim_id = c.id),
    '[]'::jsonb
  ) AS parties,
  COALESCE(
    (SELECT jsonb_agg(to_jsonb(cvi.*) ORDER BY cvi.reihenfolge NULLS LAST, cvi.created_at)
     FROM claim_vehicle_involvements cvi WHERE cvi.claim_id = c.id),
    '[]'::jsonb
  ) AS vehicle_involvements,
  COALESCE(
    (SELECT jsonb_agg(to_jsonb(cp2.*) ORDER BY cp2.created_at)
     FROM claim_payments cp2 WHERE cp2.claim_id = c.id),
    '[]'::jsonb
  ) AS payments,
  COALESCE(
    (SELECT jsonb_agg(to_jsonb(cm.*) ORDER BY cm.created_at)
     FROM claim_mietwagen cm WHERE cm.claim_id = c.id),
    '[]'::jsonb
  ) AS mietwagen,
  COALESCE(
    (SELECT jsonb_agg(to_jsonb(vk.*) ORDER BY vk.datum)
     FROM vs_korrespondenz vk WHERE vk.claim_id = c.id),
    '[]'::jsonb
  ) AS vs_korrespondenz,
  COALESCE(
    (SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at)
     FROM repairs r WHERE r.claim_id = c.id),
    '[]'::jsonb
  ) AS repairs
FROM claims c
LEFT JOIN faelle f ON f.id = c.id;

COMMENT ON VIEW v_claim_full IS
  'CMM-2: Breiter Read-View für Detail-Pages. Joint claims + alle 1:n Sub-Entities '
  'als jsonb-Arrays. NIE für Listen verwenden — dafür v_claim_listing. RLS via Quell-Tabellen.';

-- ════════════════════════════════════════════════════════════════════════
-- Grants — authenticated bekommt SELECT, RLS regelt was sichtbar ist
-- ════════════════════════════════════════════════════════════════════════
GRANT SELECT ON v_claim_listing TO authenticated;
GRANT SELECT ON v_claim_full    TO authenticated;
