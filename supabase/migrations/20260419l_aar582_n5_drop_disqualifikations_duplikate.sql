-- AAR-582 (N5) — disqualifikations_grund + _key auf leads droppen.
--
-- Legacy-Duplikate zu `disqualifiziert_grund` (canonical). Vor dem Drop:
--  * `disqualifiziert_grund_key` (parity zum _key der Legacy-Spalte) neu anlegen,
--  * beide Canonical-Spalten aus den Legacy-Spalten backfillen (COALESCE,
--    canonical gewinnt wenn beide gesetzt sind),
--  * dann Legacy droppen.
--
-- Die Enum-Key-Werte (z. B. 'parkplatz_ohne_kamera', 'eigenverantwortung')
-- bleiben als Freitext-Strings erhalten — wir führen kein PG-Enum ein, weil
-- der TS-Typ `DisqualifikationsGrund` im Code das bereits trägt.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS disqualifiziert_grund_key text;

UPDATE leads
SET disqualifiziert_grund = COALESCE(disqualifiziert_grund, disqualifikations_grund)
WHERE disqualifiziert_grund IS NULL AND disqualifikations_grund IS NOT NULL;

UPDATE leads
SET disqualifiziert_grund_key = COALESCE(disqualifiziert_grund_key, disqualifikations_grund_key)
WHERE disqualifiziert_grund_key IS NULL AND disqualifikations_grund_key IS NOT NULL;

ALTER TABLE leads DROP COLUMN IF EXISTS disqualifikations_grund;
ALTER TABLE leads DROP COLUMN IF EXISTS disqualifikations_grund_key;
