-- CMM-2 Fix: Korrekter Join zwischen claims und faelle.
--
-- Initial-View aus 20260426215130 hat `LEFT JOIN faelle f ON f.id = c.id`
-- benutzt — das ist falsch. `faelle.id` und `claims.id` sind ZWEI
-- unterschiedliche IDs. Die Brücke heißt `faelle.claim_id` (NOT NULL nach
-- AAR-816). Diese Migration korrigiert beide Views.
--
-- DROP+CREATE statt CREATE OR REPLACE: weil sich die Spaltenanzahl ändert
-- (neue Spalte fall_id), erlaubt Postgres kein In-Place-Replace.

DROP VIEW IF EXISTS v_claim_listing;
DROP VIEW IF EXISTS v_claim_full;

CREATE VIEW v_claim_listing
WITH (security_invoker = true) AS
SELECT
  c.id                              AS claim_id,
  c.claim_nummer,
  c.phase,
  c.status,
  c.schadentag,
  c.kunden_konstellation,
  c.created_at,
  c.updated_at,
  -- Assignment aus faelle (via faelle.claim_id → claims.id)
  f.id                              AS fall_id,
  f.fall_nummer,
  f.sv_id,
  f.kundenbetreuer_id              AS faelle_kundenbetreuer_id,
  c.kundenbetreuer_id              AS claim_kundenbetreuer_id,
  f.service_typ,
  -- Kunde-Anzeigename
  p.anzeigename                    AS kunde_anzeigename,
  p.vorname                        AS kunde_vorname,
  p.nachname                       AS kunde_nachname,
  -- Fahrzeug-Kennzeichen
  v.kennzeichen_aktuell           AS kennzeichen
FROM claims c
LEFT JOIN faelle f       ON f.claim_id = c.id
LEFT JOIN profiles p     ON p.id = c.geschaedigter_user_id
LEFT JOIN vehicles v     ON v.id = c.vehicle_id;

COMMENT ON VIEW v_claim_listing IS
  'CMM-2 (fix): Schmaler Read-View. Join auf faelle.claim_id = claims.id korrigiert.';

CREATE VIEW v_claim_full
WITH (security_invoker = true) AS
SELECT
  c.*,
  -- Assignment aus faelle (via faelle.claim_id → claims.id)
  f.id          AS fall_id,
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
LEFT JOIN faelle f ON f.claim_id = c.id;

COMMENT ON VIEW v_claim_full IS
  'CMM-2 (fix): Breiter Read-View. Join auf faelle.claim_id = claims.id korrigiert. '
  'Liefert zusätzlich fall_id zur Auflösung von Legacy-Routen.';

GRANT SELECT ON v_claim_listing TO authenticated;
GRANT SELECT ON v_claim_full    TO authenticated;
