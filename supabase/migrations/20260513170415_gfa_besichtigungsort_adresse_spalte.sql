-- DRIFT-RECOVERY (rekonstruiert 13.05.2026 17:18) — Migration appliziert
-- via MCP `apply_migration` ohne lokales Repo-File (Regel-2-Drift).
-- Diese Version hat den GLEICHEN Namen wie 20260513163559 — wahrscheinlich
-- ein Re-Apply-Versuch derselben SQL durch dieselbe oder eine andere
-- Session, ohne dass jemand realisierte dass die erste Migration bereits
-- gelaufen war.
--
-- Recovery-Strategie: identische SQL wie 163559 mit IF NOT EXISTS,
-- damit `db reset` den State korrekt reproduzieren kann ohne Fehler.

ALTER TABLE public.gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS besichtigungsort_adresse text;
