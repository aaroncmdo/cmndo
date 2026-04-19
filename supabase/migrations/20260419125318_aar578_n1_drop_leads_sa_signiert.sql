-- AAR-578 (N1) — leads.sa_signiert droppen.
--
-- Legacy-Duplikat. Canonical ist leads.sa_unterschrieben (bool) +
-- leads.sa_unterschrieben_am (timestamptz) — identisch zum Pattern auf
-- faelle. sa_signiert wurde laut grep nirgends im Produktiv-Code gelesen
-- oder geschrieben (nur in database.types.ts sichtbar gewesen).
--
-- Backfill nicht nötig: wer den bool gesetzt hatte, hat parallel auch
-- sa_unterschrieben gesetzt. Zur Sicherheit zieht das Update etwaige
-- verwaiste Altdaten einmalig nach, bevor die Spalte fällt.

UPDATE leads
SET sa_unterschrieben = true
WHERE sa_signiert = true AND sa_unterschrieben IS DISTINCT FROM true;

ALTER TABLE leads DROP COLUMN IF EXISTS sa_signiert;
