-- AAR-545 Cluster D (Phase 2) — Gegner-Versicherung
-- Additive Migration + Backfill:
--   1. ADD faelle.gegner_schadennummer (neu)
--   2. RENAME faelle.versicherungsnummer_gegner -> gegner_versicherungsnummer
--   3. Backfill gegner_schadennummer aus leads.gegner_schadennummer
-- Phase 5 droppt danach: versicherung_gegner_name, schadennummer_versicherung,
-- versicherung_schaden_nr, versicherung_name, versicherung_id.

ALTER TABLE faelle ADD COLUMN gegner_schadennummer text;
ALTER TABLE faelle RENAME COLUMN versicherungsnummer_gegner TO gegner_versicherungsnummer;

UPDATE faelle f
SET gegner_schadennummer = l.gegner_schadennummer
FROM leads l
WHERE f.lead_id = l.id
  AND f.gegner_schadennummer IS NULL
  AND l.gegner_schadennummer IS NOT NULL;;
