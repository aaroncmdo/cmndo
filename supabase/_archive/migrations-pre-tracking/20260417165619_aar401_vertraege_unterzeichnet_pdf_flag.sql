ALTER TABLE vertraege_unterzeichnet
  ADD COLUMN IF NOT EXISTS pdf_generiert_am TIMESTAMPTZ;

COMMENT ON COLUMN vertraege_unterzeichnet.pdf_generiert_am IS
  'AAR-401: Zeitstempel des finalen PDF-Builds (für Re-Gen-Detection).';;
