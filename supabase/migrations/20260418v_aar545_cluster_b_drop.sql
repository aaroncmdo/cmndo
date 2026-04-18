-- AAR-545 Cluster B (Phase 5) — VS-Reaktion + Eskalation
-- Drop der 3 Duplikat-Spalten nach Backfill in Phase 2.

ALTER TABLE faelle DROP COLUMN vs_antwort_datum;
ALTER TABLE faelle DROP COLUMN vs_timer_stufe;
ALTER TABLE faelle DROP COLUMN vs_eskalation_am;
