-- AAR-545 Cluster C (Phase 5) — Drop faelle.schadenshoehe
-- gutachter_abrechnungspositionen.schadenshoehe bleibt als eigenständige
-- Abrechnungs-Position-Spalte.

ALTER TABLE faelle DROP COLUMN schadenshoehe;
