-- SMOKE-2026-05-15 Vollstrecke-Smoke ROLLBACK
-- Diese SQLs am Ende des Smokes ausführen damit nichts persistiert.

-- 1) test-sv firmenname zurücksetzen (war für Karten-Sichtbarkeit gepatched)
UPDATE sachverstaendige
SET firmenname = 'Test Aaron Gutachter GmbH'
WHERE id = '1da11741-a406-45ce-a27b-c041576cccbb'
  AND firmenname = 'Schmidt Sachverständige Köln';

-- 2) Smoke-Daten löschen (IDs werden während des Smokes hier nachgetragen)
-- Snapshot pre-smoke: leads=228, faelle=16, claims=16, auftraege=1, gutachter_termine=13
--
-- DELETE FROM gutachter_termine WHERE auftrags_id IN (<auftrag-ids>);
-- DELETE FROM gutachten WHERE auftrags_id IN (<auftrag-ids>);
-- DELETE FROM auftraege WHERE id IN (<auftrag-ids>);
-- DELETE FROM claims WHERE id IN (<claim-ids>);
-- DELETE FROM faelle WHERE id IN (<fall-ids>);
-- DELETE FROM leads WHERE id IN (<lead-ids>);

-- Verifizierung nach Cleanup:
-- SELECT count(*) FROM leads;            -- soll = 228
-- SELECT count(*) FROM faelle;           -- soll = 16
-- SELECT count(*) FROM claims;           -- soll = 16
-- SELECT count(*) FROM auftraege;        -- soll = 1
-- SELECT count(*) FROM gutachter_termine; -- soll = 13
