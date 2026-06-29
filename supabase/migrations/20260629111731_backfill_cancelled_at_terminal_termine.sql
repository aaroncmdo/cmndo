-- Backfill: terminal-cancelled Termine ohne cancelled_at bekommen es nachgetragen.
-- Invariante: status IN (verschoben, storniert, abgelehnt, abgesagt) => cancelled_at NOT NULL.
-- Behebt 23 Live-Zeilen die die Invariante verletzten (Geist-Risiko in cancelled_at-gefilterten
-- Listen/Crons). 'verlegt' ist BEWUSST ausgeschlossen = lebendes SV-Propose-Intermediate
-- (kann via Rollback -> bestaetigt oder via Accept -> verschoben werden).
-- Idempotent (WHERE cancelled_at IS NULL). cancelled_at = updated_at = Zeitpunkt der Terminierung.
UPDATE public.gutachter_termine
SET cancelled_at = updated_at
WHERE cancelled_at IS NULL
  AND status IN ('verschoben', 'storniert', 'abgelehnt', 'abgesagt');
