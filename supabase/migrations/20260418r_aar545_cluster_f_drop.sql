-- AAR-545 Cluster F (Phase 5) — Drop vorschaden_vorhanden
-- Alle Code-Referenzen wurden in Phase 3 auf hat_vorschaeden migriert.

ALTER TABLE faelle DROP COLUMN vorschaden_vorhanden;
