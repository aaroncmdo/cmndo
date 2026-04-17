-- AAR-401: Tracking wann das Vertrags-PDF final generiert + in Storage hochgeladen
-- wurde. pdf_storage_path existiert bereits seit KFZ-148 — diese Spalte ist
-- zusätzlich für Auditing und Re-Generations-Erkennung.

ALTER TABLE vertraege_unterzeichnet
  ADD COLUMN IF NOT EXISTS pdf_generiert_am TIMESTAMPTZ;

COMMENT ON COLUMN vertraege_unterzeichnet.pdf_generiert_am IS
  'AAR-401: Zeitstempel des finalen PDF-Builds (für Re-Gen-Detection).';
