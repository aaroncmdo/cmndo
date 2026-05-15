-- AAR-916: Drop verwaister Qualifikationen-Gate-Functions
--
-- Hintergrund: AAR-515 hat im April 2026 die DB-Functions get_sichtbare_qualifikationen
-- und is_dat_badge_sichtbar eingeführt, um qualifikationen_neu für externe
-- Kundenkommunikation (Flow-Link, Kunde-Portal, Emails) zu gaten. Der Helper
-- src/lib/sv/qualifikationen-gate.ts hat die beiden Functions per RPC aufgerufen.
--
-- Stand 15.05.2026:
--   - 0 Caller des JS-Helpers im Code (alle externen Render-Pfade rendern
--     qualifikationen_neu aktuell gar nicht)
--   - 0 DB-Dependencies (keine View, keine Policy, keine andere Function nutzt
--     die beiden Functions, verifiziert via pg_depend)
--   - Memory live_rls_audit 14.05.2026 hat is_dat_badge_sichtbar bereits als
--     Orphan-Function identifiziert
--
-- Wenn ein extern-sichtbarer Qualifikations-Block in Zukunft wieder gebraucht
-- wird, kann sowohl Function- als auch JS-Helper-Code aus Git wiederhergestellt
-- werden (AAR-515-Commit). Aktueller Code soll keinen toten Helper-Layer mehr
-- mitschleppen.

DROP FUNCTION IF EXISTS public.get_sichtbare_qualifikationen(uuid);
DROP FUNCTION IF EXISTS public.is_dat_badge_sichtbar(uuid);
