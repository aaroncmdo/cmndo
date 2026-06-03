-- P1 (dispatch-config-unify): Unfallgegner-Kontakt (§8d) — Erfassung jetzt,
-- Gegner-Flowlink spaeter. Rein additiv (es gibt gegner_name/versicherung/
-- kennzeichen/schadennummer, aber keine Kontakt-Spalten).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS gegner_telefon text,
  ADD COLUMN IF NOT EXISTS gegner_email text;
