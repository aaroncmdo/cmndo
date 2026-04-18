-- AAR-545 Cluster A (Phase 5) — Drop vs_anschreiben_datum
-- Legacy-Duplikat zu anschlussschreiben_sendedatum. Alle Code-Referenzen
-- wurden in Phase 3 auf anschlussschreiben_sendedatum umgestellt; Backfill
-- lief in Phase 2 (20260418o).

ALTER TABLE faelle DROP COLUMN vs_anschreiben_datum;
