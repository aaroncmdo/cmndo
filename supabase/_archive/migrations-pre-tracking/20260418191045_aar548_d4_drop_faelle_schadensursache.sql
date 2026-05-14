-- AAR-548 D4: Duplikat `faelle.schadensursache` droppen.
-- Quelle: KFZ-140 hatte einen Sync-Trigger gebaut, der beide Spalten parallel
-- halt. Daten-Check (AAR-545 Regel #14): beide Spalten 0 Zeilen befüllt in 14
-- Faellen — kein Backfill-Risiko. Codebase nutzt `schadens_ursache` (30+ Refs,
-- passt zum `schadens_*`-Pattern auf faelle). `leads.schadensursache` bleibt
-- unverändert (eigene Tabelle, semantisch der Qualifizierungs-Touchpoint).

-- View hängt an faelle.* — erst droppen, Column raus, dann recreaten.
DROP VIEW IF EXISTS v_faelle_mit_aktuellem_termin;

DROP TRIGGER IF EXISTS trg_sync_faelle_ursache ON faelle;
DROP FUNCTION IF EXISTS sync_faelle_ursache();
ALTER TABLE faelle DROP COLUMN IF EXISTS schadensursache;

-- View identisch zu 20260418y_aar545_cluster_e_view_aktueller_termin.sql
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
