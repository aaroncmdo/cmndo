-- AAR-545 Cluster D (Phase 5) — Gegner-Versicherung
-- Drop der 5 Duplikat-Spalten nach Backfill + Code-Sweep in Phase 2+3.
-- Source-of-Truth:
--   Eigene VS   -> leads.eigene_versicherung / leads.eigene_policennr
--   Gegner-VS   -> faelle.gegner_versicherung (Freitext) / gegner_versicherung_id (FK)
--   Gegner-Nrn. -> faelle.gegner_schadennummer / gegner_versicherungsnummer

ALTER TABLE faelle DROP COLUMN versicherung_gegner_name;
ALTER TABLE faelle DROP COLUMN schadennummer_versicherung;
ALTER TABLE faelle DROP COLUMN versicherung_schaden_nr;
ALTER TABLE faelle DROP COLUMN versicherung_name;
ALTER TABLE faelle DROP COLUMN versicherung_id;
