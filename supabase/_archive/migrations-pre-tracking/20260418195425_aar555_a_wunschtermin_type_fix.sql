DROP VIEW IF EXISTS v_faelle_mit_aktuellem_termin;

ALTER TABLE faelle ADD COLUMN wunschtermin_ts timestamptz;

UPDATE faelle
SET wunschtermin_ts = wunschtermin::timestamptz
WHERE wunschtermin IS NOT NULL;

ALTER TABLE faelle DROP COLUMN wunschtermin;
ALTER TABLE faelle RENAME COLUMN wunschtermin_ts TO wunschtermin;

COMMENT ON COLUMN faelle.wunschtermin IS
  'Kunden-Wunschtermin für SV-Besichtigung (timestamptz, analog leads.wunschtermin). '
  'Source aus Lead-Qualifizierung (Phase 2 Termin/Service-Typ). '
  'Seit AAR-555 A: text → timestamptz für Type-Konsistenz mit leads.';

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
) t ON true;;
