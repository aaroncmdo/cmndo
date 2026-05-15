-- AAR-548 D10: faelle.finanzierung_flag + faelle.leasing_flag droppen
-- Truth ist jetzt nur noch finanzierung_leasing-Enum ('keine'|'leasing'|'finanzierung').
-- Daten-Check: 14/14 Rows haben beide Booleans = false + finanzierung_leasing='keine' — kein Backfill.
-- leads behält beide Booleans vorerst (anderer Phase-Scope).

DROP VIEW IF EXISTS v_faelle_mit_aktuellem_termin;

ALTER TABLE faelle DROP COLUMN IF EXISTS finanzierung_flag;
ALTER TABLE faelle DROP COLUMN IF EXISTS leasing_flag;

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
  'Rangfolge: bestaetigt > reserviert > durchgefuehrt, dann start_zeit DESC.';

COMMENT ON COLUMN faelle.finanzierung_leasing IS
  'Enum: keine | leasing | finanzierung. Source-of-Truth fuer Fahrzeug-Besitzverhaeltnis. '
  'Ersetzt seit AAR-548 D10 die Legacy-Booleans leasing_flag + finanzierung_flag.';;
