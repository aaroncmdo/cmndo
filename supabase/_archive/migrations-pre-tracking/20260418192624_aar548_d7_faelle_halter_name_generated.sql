-- AAR-548 D7: `faelle.halter_name` als Duplikat zu `halter_vorname + halter_nachname`.
-- Regel-#14-Daten-Check: 0/14 Aggregat-befuellt, 5 vorname, 6 nachname,
-- 0 beide_gesetzt. Aggregat-Write wurde in 4 Code-Stellen durchgefuehrt, aber
-- Reads koennen per concat ersetzt werden.
-- Strategie: Column zur GENERATED ALWAYS AS (vorname + nachname) umbauen —
-- damit bleiben alle Lese-Pfade kompatibel, Writes werden aber Compile-Error.
-- View temporaer droppen.

DROP VIEW IF EXISTS v_faelle_mit_aktuellem_termin;

ALTER TABLE faelle DROP COLUMN IF EXISTS halter_name;
ALTER TABLE faelle ADD COLUMN halter_name TEXT
  GENERATED ALWAYS AS (
    NULLIF(
      TRIM(BOTH FROM
        COALESCE(halter_vorname, '') || ' ' || COALESCE(halter_nachname, '')
      ),
      ''
    )
  ) STORED;

COMMENT ON COLUMN faelle.halter_name IS
  'AAR-548 D7: Generated column aus halter_vorname + halter_nachname. '
  'Nicht manuell schreibbar — fuer Writes halter_vorname/halter_nachname setzen.';

CREATE OR REPLACE VIEW v_faelle_mit_aktuellem_termin AS
SELECT
  f.*,
  t.id AS aktueller_termin_id,
  t.start_zeit AS aktueller_termin_start,
  t.end_zeit AS aktueller_termin_end,
  t.status AS aktueller_termin_status,
  t.sv_id AS aktueller_termin_sv_id,
  t.kanal AS aktueller_termin_kanal,
  t.typ AS aktueller_termin_typ,
  t.final_verbindlich_ab AS aktueller_termin_final_verbindlich_ab
FROM faelle f
LEFT JOIN LATERAL (
  SELECT gt.*
  FROM gutachter_termine gt
  WHERE gt.fall_id = f.id
    AND gt.status IN ('bestaetigt', 'reserviert', 'durchgefuehrt')
  ORDER BY
    CASE gt.status
      WHEN 'bestaetigt' THEN 1
      WHEN 'reserviert' THEN 2
      WHEN 'durchgefuehrt' THEN 3
      ELSE 4
    END,
    gt.start_zeit DESC NULLS LAST
  LIMIT 1
) t ON true;

COMMENT ON VIEW v_faelle_mit_aktuellem_termin IS
  'AAR-545 Cluster E: Fall + aktuell relevanter gutachter_termine-Eintrag. '
  'Rangfolge: bestaetigt > reserviert > durchgefuehrt, dann start_zeit DESC. '
  'Konsumenten sollten hier lesen statt faelle.sv_termin (Legacy-Scalar).';;
