-- AAR-545 Cluster B (Phase 2) — VS-Reaktion + Eskalation
-- Backfill der Duplikate auf ihre Source-of-Truth:
--   vs_antwort_datum -> vs_reaktion_am
--   vs_timer_stufe   -> vs_eskalationsstufe
-- vs_eskalation_am wird in Phase 5 ersatzlos gedroppt (redundant zu eskalation_tag_*_am).

UPDATE faelle
SET vs_reaktion_am = vs_antwort_datum
WHERE vs_reaktion_am IS NULL
  AND vs_antwort_datum IS NOT NULL;

UPDATE faelle
SET vs_eskalationsstufe = vs_timer_stufe
WHERE vs_eskalationsstufe IS NULL
  AND vs_timer_stufe IS NOT NULL;
