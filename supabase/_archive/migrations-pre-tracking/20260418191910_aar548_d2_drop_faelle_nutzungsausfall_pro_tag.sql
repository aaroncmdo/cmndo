-- AAR-548 D2: Duplikat `faelle.nutzungsausfall_pro_tag` droppen.
-- Regel-#14-Daten-Check: 0/14 Zeilen in beiden Spalten befuellt — kein Backfill.
-- Code-Sweep: nutzungsausfall_pro_tag hat 0 aktive Refs (nur die historische
-- Migration die es angelegt hat); nutzungsausfall_tagessatz wird aktiv von
-- ocr-gutachten + fall-finanzen (Nutzungsausfall-Berechnung) benutzt.
-- → pro_tag droppen, tagessatz bleibt Einheitsfeld. Master-Prompt-Hypothese
-- wurde durch Code-Realitaet umgekehrt.

DROP VIEW IF EXISTS v_faelle_mit_aktuellem_termin;

ALTER TABLE faelle DROP COLUMN IF EXISTS nutzungsausfall_pro_tag;

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
