-- AAR-548 D8: faelle.zeuge_name + zeuge_anschrift + zeuge_telefon + zeuge_email droppen.
-- Truth ist zeugen_kontakte JSONB-Array (variabel N Zeugen pro Fall).
--
-- Daten-Check:
--   einzelfelder_befuellt: 0/14 (keine Row nutzt die 4 Legacy-Felder)
--   zeugen_kontakte:       1/14 (bereits Live-Daten im neuen Format)
--   → Kein Backfill nötig.
--
-- Code-Sweep: nur lexdrive/email-sender.ts referenziert zeuge_* — auf Array-Iteration
-- migriert in gleichem Commit.

DROP VIEW IF EXISTS v_faelle_mit_aktuellem_termin;

ALTER TABLE faelle DROP COLUMN IF EXISTS zeuge_name;
ALTER TABLE faelle DROP COLUMN IF EXISTS zeuge_anschrift;
ALTER TABLE faelle DROP COLUMN IF EXISTS zeuge_telefon;
ALTER TABLE faelle DROP COLUMN IF EXISTS zeuge_email;

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

COMMENT ON COLUMN faelle.zeugen_kontakte IS
  'JSONB-Array: [{name, anschrift?, telefon?, email?, notiz?}]. Variable N Zeugen pro Fall. '
  'Source-of-Truth — ersetzt seit AAR-548 D8 die 4 Einzelfelder (zeuge_name etc.).';;
