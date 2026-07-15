-- B3/T4 (Status-Achsen-Konsolidierung): work_state (Dispatch/Processing-Achse) eliminiert.
-- Safe-Drop: alle Reader/Writer entfernt (PR #4390, prod-live verifiziert via Fallakte-Badge-Smoke
-- CLM-2026-00752 -> "Ersterfassung"), keine DB-Abhaengigkeit ausser dem eigenen CHECK (verifiziert
-- per pg_views/pg_proc/pg_policies/pg_constraint-Scan). operative_status ist ab hier die EINZIGE
-- Status-Achse der claims-Tabelle. Der column-CHECK claims_work_state_check faellt mit der Spalte.
ALTER TABLE public.claims DROP COLUMN IF EXISTS work_state;
