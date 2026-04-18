-- AAR-548 D9: faelle.anwalt_status dropen
--
-- Regel-#14-Daten-Check (Pre-Drop):
--   - 14/14 Rows haben Default 'nicht-noetig' — keine anderen Werte
--   - Anwalt-Lifecycle wird durch kanzlei_id / kanzlei_uebergeben_am /
--     kanzlei_provision_status abgebildet
--   - 1 Row hat kanzlei_uebergeben_am gesetzt aber anwalt_status = 'nicht-noetig'
--     — Feld wurde nicht aktiv gepflegt, war totes Legacy-Feld
--
-- Code-Check: 0 Consumer ausser auto-generierte database.types.ts.
--
-- v_faelle_mit_aktuellem_termin hängt via SELECT f.* an der Spalte —
-- daher erst View droppen, Column raus, dann identisch neu anlegen.

DROP VIEW IF EXISTS v_faelle_mit_aktuellem_termin;

ALTER TABLE faelle DROP COLUMN IF EXISTS anwalt_status;

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
