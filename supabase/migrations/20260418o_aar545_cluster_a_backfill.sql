-- AAR-545 Cluster A (Phase 2) — Anschlussschreiben-Datum
-- Backfill der neuen Source-of-Truth (anschlussschreiben_sendedatum)
-- aus dem Legacy-Feld vs_anschreiben_datum. Drop erfolgt in Phase 5.

UPDATE faelle
SET anschlussschreiben_sendedatum = vs_anschreiben_datum::date
WHERE anschlussschreiben_sendedatum IS NULL
  AND vs_anschreiben_datum IS NOT NULL;
