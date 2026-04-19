-- AAR-579 (N2) — leads.vollmacht_signiert (bool) droppen.
--
-- Legacy-Bool, nie im Produktiv-Code gelesen. Nach AAR-583 (N6) ist die
-- canonical Quelle `leads.vollmacht_signiert_am` (timestamptz) — Bool-
-- Semantik wird aus `_am IS NOT NULL` abgeleitet.
--
-- Symmetrisch zu AAR-578 (N1) `leads.sa_signiert` Drop-Pattern.
--
-- Reihenfolge: MUSS nach AAR-583 (N6) laufen, damit alle Consumer bereits
-- auf `_am` umgestellt sind.

ALTER TABLE leads DROP COLUMN IF EXISTS vollmacht_signiert;
