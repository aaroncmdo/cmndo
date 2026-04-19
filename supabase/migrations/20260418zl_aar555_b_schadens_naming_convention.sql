-- AAR-555 Scope B: Namens-Konvention schadens_* auf faelle + leads.
--
-- Alle Spalten die Schaden-Kontext beschreiben werden auf einheitliches
-- "schadens_<noun>"-Präfix gebracht (analog schadens_datum, schadens_adresse,
-- schadens_ort etc. die bereits korrekt benannt waren).
--
-- Renames (faelle):
--   schadenart          → schadens_art
--   schadenfall_typ     → schadens_fall_typ
--   schadenhergang      → schadens_hergang
--   schadenhoehe_netto  → schadens_hoehe_netto
--
-- Renames (leads):
--   schadenart          → schadens_art
--   schadenfall_typ     → schadens_fall_typ
--   schadenhergang      → schadens_hergang
--
-- Regel-#14-Daten-Check (14 faelle / 27 leads):
--   faelle.schadenart         0/14   leads.schadenart         0/27
--   faelle.schadenfall_typ    2/14   leads.schadenfall_typ    6/27
--   faelle.schadenhergang     9/14   leads.schadenhergang     8/27
--   faelle.schadenhoehe_netto 0/14   (nur faelle)
--   RENAME behält Daten atomar — kein Backfill nötig.
--
-- Nicht betroffen (eigenständige Spalten anderer Tabellen):
--   abrechnung_positionen.schadenhoehe_netto
--   gutachter_abrechnungen.schadenhoehe
--   gutachter_abrechnungspositionen.schadenshoehe
--   leadpreise_tabelle.schadenhoehe_bis_netto
--   sachverstaendige.schadenarten (Array, semantisch unterschiedlich)
--
-- View v_faelle_mit_aktuellem_termin nutzt SELECT f.* → drop+recreate.

DROP VIEW IF EXISTS v_faelle_mit_aktuellem_termin;

-- faelle
ALTER TABLE faelle RENAME COLUMN schadenart TO schadens_art;
ALTER TABLE faelle RENAME COLUMN schadenfall_typ TO schadens_fall_typ;
ALTER TABLE faelle RENAME COLUMN schadenhergang TO schadens_hergang;
ALTER TABLE faelle RENAME COLUMN schadenhoehe_netto TO schadens_hoehe_netto;

-- leads
ALTER TABLE leads RENAME COLUMN schadenart TO schadens_art;
ALTER TABLE leads RENAME COLUMN schadenfall_typ TO schadens_fall_typ;
ALTER TABLE leads RENAME COLUMN schadenhergang TO schadens_hergang;

COMMENT ON COLUMN faelle.schadens_hergang IS
  'Strukturierter Unfallhergang nach Dispatch-Qualifizierung (Phase 1 Follow-Up-Q&A). '
  'Source-of-Truth für SV-Briefing, Unfallskizze, Phase-5-Zusammenfassung. '
  'Ersetzt NICHT schadenhergang (der bleibt als Roh-Snapshot).';

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
