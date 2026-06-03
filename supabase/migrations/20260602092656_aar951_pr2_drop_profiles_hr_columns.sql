-- W2.3 / AAR-951 PR2: HR-/Verguetungs-Spalten von profiles droppen.
--
-- Gate (alles vor dem Drop verifiziert):
--  * PR1 (#2214) prod-live: Prod-Build 2026-06-02 09:00 UTC liest
--    mitarbeiter_verguetung in 5 SSR-Chunks (VPS-Verify), PM2-Reload 09:22.
--  * Reader-Sweep: kein Code liest gehalt_brutto/gehaltsstufe/position/
--    eingestellt_am mehr aus profiles (nur /admin/team via mitarbeiter_verguetung).
--  * Info-Loss-Gate: das einzige Datum (1x eingestellt_am, profile a97b63ee =
--    2026-05-11) ist identisch nach mitarbeiter_verguetung migriert (in_mv=true).
--  * gehalt_brutto/gehaltsstufe/position = 0 non-null; keine View-/Index-Deps.
--
-- Type-Regen + any-Cast-Cleanup in admin/team folgen beim naechsten
-- koordinierten Full-Regen (Collision-Hotspot — W2.3-PR1-Lesson).
alter table public.profiles
  drop column if exists gehalt_brutto,
  drop column if exists gehaltsstufe,
  drop column if exists position,
  drop column if exists eingestellt_am;
