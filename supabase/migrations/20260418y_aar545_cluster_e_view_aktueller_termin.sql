-- AAR-545 Cluster E (VIEW-Only) — SV-Termin
-- Erstellt v_faelle_mit_aktuellem_termin: verbindet faelle mit dem aktuell
-- relevanten gutachter_termine-Eintrag (bestaetigt > reserviert > durchgefuehrt),
-- damit Konsumenten nicht mehr faelle.sv_termin (Legacy-Scalar) lesen muessen.
-- Kein Drop — sv_termin bleibt als Cache-Feld erhalten, weil es in Listen-Views
-- ohne Join verwendet wird.

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
  'Konsumenten sollten hier lesen statt faelle.sv_termin (Legacy-Scalar).';
