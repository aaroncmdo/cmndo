-- AAR-181: fahrzeug_baujahr als Pflichtfeld in Dispatch-Phase 4 → muss auch
-- auf leads existieren (bisher nur auf faelle). Integer-Spalte analog zu
-- faelle.fahrzeug_baujahr, nullable (wird beim Lead-Fall-Mapping übernommen).

ALTER TABLE leads ADD COLUMN IF NOT EXISTS fahrzeug_baujahr INTEGER;
COMMENT ON COLUMN leads.fahrzeug_baujahr IS
  'AAR-181: Baujahr — Pflichtfeld in Dispatch-Phase 4, wird beim Fall-Mapping übernommen.';
