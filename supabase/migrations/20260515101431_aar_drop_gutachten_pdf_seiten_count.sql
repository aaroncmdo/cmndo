-- AAR Follow-up zu Cluster F+G PR-1 (#1293)
-- DROP gutachten.pdf_seiten_count — Dead-Storage-Cleanup
--
-- Befund (Handoff-Doc docs/15.05.2026/claims-cleanup-handoff.md):
-- Beim Anlegen von gutachten_seitenzahl in PR-1 wurde übersehen, dass
-- gutachten bereits eine pdf_seiten_count-Spalte hatte (aus Migration
-- aar838_gutachten_ocr_columns). pdf_seiten_count hat 0 Application-Caller
-- (nur in src/lib/supabase/database.types.ts als generated Type), während
-- gutachten_seitenzahl aktiv via FIELD_MAP in lib/ai/gutachten-ocr.ts
-- gesetzt und in GutachtenOcrCard editiert wird.
--
-- Da die Spalte semantisch dasselbe Daten-Stück darstellt (Anzahl Gutachten-
-- Seiten) und nirgends gelesen wird, droppen wir sie. Falls später eine
-- "PDF-technische" Page-Count gegen "OCR-extrahierte" Page-Count unter-
-- schieden werden soll, kann das via eigener Spalte mit anderem Namen
-- (z.B. pdf_seiten_count_technisch) wieder eingeführt werden.

BEGIN;

ALTER TABLE public.gutachten DROP COLUMN IF EXISTS pdf_seiten_count;

COMMIT;
