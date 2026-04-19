-- AAR-545 Cluster C (Phase 2) — Schadenhöhe
-- schadenshoehe (brutto) ist redundant zu reparaturkosten.
-- schadenhoehe_netto bleibt als eigenständiger Netto-Wert.

UPDATE faelle
SET reparaturkosten = schadenshoehe
WHERE reparaturkosten IS NULL
  AND schadenshoehe IS NOT NULL;
