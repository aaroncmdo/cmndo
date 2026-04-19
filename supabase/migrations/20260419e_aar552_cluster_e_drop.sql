-- AAR-552 Cluster E — Full Drop (Commit 2)
-- Rebuild v_faelle_mit_aktuellem_termin als Compat-Shim:
--   die 6 Legacy-Spalten (sv_termin, gutachter_termin_status,
--   gutachter_termin_bestaetigt, gutachter_gegenvorschlag_datum,
--   gutachter_gegenvorschlag_grund) werden jetzt aus gutachter_termine
--   abgeleitet und über die View unter gleichem Namen ausgeliefert, damit
--   bestehende Reader weiterlaufen. besichtigung_datum wird komplett
--   entfernt (nur Admin-Inline-Display ohne Business-Logik).
-- Danach DROP COLUMN x6 auf faelle.
-- gutachter_termine.status erlaubt bereits 'abgelehnt' und 'gegenvorschlag'
-- (seit BUG-66/20260408) — kein CHECK-ALTER nötig.

-- 1. View mit DROP+CREATE (CREATE OR REPLACE bricht bei geänderten Spalten)
DROP VIEW IF EXISTS v_faelle_mit_aktuellem_termin;

-- 2. DROP COLUMN x6 auf faelle
ALTER TABLE faelle DROP COLUMN IF EXISTS sv_termin;
ALTER TABLE faelle DROP COLUMN IF EXISTS besichtigung_datum;
ALTER TABLE faelle DROP COLUMN IF EXISTS gutachter_termin_status;
ALTER TABLE faelle DROP COLUMN IF EXISTS gutachter_termin_bestaetigt;
ALTER TABLE faelle DROP COLUMN IF EXISTS gutachter_gegenvorschlag_datum;
ALTER TABLE faelle DROP COLUMN IF EXISTS gutachter_gegenvorschlag_grund;

-- 3. View neu aufbauen — additive Termin-Felder + 5 Legacy-Kompat-Felder
CREATE VIEW v_faelle_mit_aktuellem_termin AS
SELECT
  f.*,
  -- Termin-Stammdaten (additiv, neu seit Cluster E V1)
  t.id AS aktueller_termin_id,
  t.start_zeit AS aktueller_termin_start,
  t.end_zeit AS aktueller_termin_end,
  t.status AS aktueller_termin_status,
  t.sv_id AS aktueller_termin_sv_id,
  t.kanal AS aktueller_termin_kanal,
  t.typ AS aktueller_termin_typ,
  t.final_verbindlich_ab AS aktueller_termin_final_verbindlich_ab,
  -- Legacy-Kompat (faelle-Spalten jetzt droppen, view spiegelt aus termine)
  t.start_zeit AS sv_termin,
  t.status AS gutachter_termin_status,
  (t.status = 'bestaetigt') AS gutachter_termin_bestaetigt,
  t.vorgeschlagenes_datum AS gutachter_gegenvorschlag_datum,
  t.gegenvorschlag_grund AS gutachter_gegenvorschlag_grund
FROM faelle f
LEFT JOIN LATERAL (
  SELECT gt.*
  FROM gutachter_termine gt
  WHERE gt.fall_id = f.id
    AND gt.status IN ('bestaetigt', 'reserviert', 'durchgefuehrt', 'gegenvorschlag')
  ORDER BY
    CASE gt.status
      WHEN 'bestaetigt' THEN 1
      WHEN 'gegenvorschlag' THEN 2
      WHEN 'reserviert' THEN 3
      WHEN 'durchgefuehrt' THEN 4
      ELSE 5
    END,
    gt.start_zeit DESC NULLS LAST
  LIMIT 1
) t ON true;

COMMENT ON VIEW v_faelle_mit_aktuellem_termin IS
  'AAR-552 Cluster E (Full Drop): Fall + aktuell relevanter gutachter_termine-Eintrag. '
  'Rangfolge: bestaetigt > gegenvorschlag > reserviert > durchgefuehrt, '
  'dann start_zeit DESC. Spiegelt die 5 gedroppten faelle-Legacy-Felder '
  '(sv_termin, gutachter_termin_status, gutachter_termin_bestaetigt, '
  'gutachter_gegenvorschlag_datum, gutachter_gegenvorschlag_grund) aus termine.';
