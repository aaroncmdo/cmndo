-- Perf-RLS: profiles-Policy-Dedup (erste Klasse-B-Scheibe, hottest table).
--
-- Ausgangslage (authenticated) -- 3 permissive Policies ueberlappen auf SELECT:
--   admin_full          ALL     USING  is_admin()              CHECK is_admin()
--   "Profil lesen"      SELECT  USING  id=uid() OR is_admin()
--   staff_read_all      SELECT  USING  id=uid() OR is_staff()
--   "Profil erstellen"  INSERT  CHECK  id=uid()
--   "Profil bearbeiten" UPDATE  USING  id=uid() OR is_admin()   (CHECK NULL -> USING gilt auch als CHECK)
--
-- Effektiver SELECT-Filter = OR aller drei:
--   is_admin() OR (id=uid() OR is_admin()) OR (id=uid() OR is_staff())
-- -> EXPLAIN zeigte 5 InitPlans, davon id=uid() 2x und is_admin() 2x doppelt.
--
-- SUBSUMPTION (Beweis): is_admin() = EXISTS(profiles WHERE id=auth.uid() AND rolle='admin');
-- is_staff() = EXISTS(profiles WHERE id=auth.uid() AND rolle IN ('admin','kundenbetreuer','dispatch')).
-- Gleiches id=auth.uid()-Praedikat, 'admin' ist Element der staff-Menge
-- => is_admin() TRUE impliziert is_staff() TRUE => (is_staff() OR is_admin()) === is_staff().
-- Damit kollabiert der SELECT-Filter exakt auf staff_read_all: (id=uid() OR is_staff()).
-- "Profil lesen" und der SELECT-Zweig von admin_full sind vollstaendig redundant.
--
-- Zielzustand -- je (authenticated, command) genau EINE permissive Policy, Zugriff identisch:
--   SELECT  staff_read_all         id=uid() OR is_staff()   (unveraendert; deckt admin via Subsumption)
--   INSERT  "Profil erstellen"     id=uid() OR is_admin()   (admin_full-Zweig eingefaltet; OR ist kommutativ
--                                                            -> identisch zum alten is_admin() OR id=uid())
--   UPDATE  "Profil bearbeiten"    id=uid() OR is_admin()   (unveraendert; admin_full-Zweig war bereits subsumiert)
--   DELETE  profiles_admin_delete  is_admin()               (NEU; qual identisch zum DELETE-Zweig von admin_full)
--
-- WICHTIG -- die Lese/Schreib-Asymmetrie bleibt exakt erhalten: SELECT ist staff-weit (is_staff),
-- UPDATE/DELETE bleiben admin-only (is_admin). Per Smoke nachgewiesen (s.u.).
--
-- CREATE-first, dann DROP (keine Zugriffsluecke; Migration ist ohnehin atomar).
--
-- Verifiziert auf prod (paizkjajbuxxksdoycev):
--   Plan:  Filter 5 InitPlans -> 2 InitPlans (je actual rows=1 loops=1).
--   Read-Smoke (Regel 4, echte JWTs): admin 38 / kundenbetreuer 38 / dispatch 38 /
--     sachverstaendiger 1 / werkstatt 1 / kanzlei 1 / makler 1 -- identisch zu vorher.
--   Write-Smoke (DML, rolled back): makler eigenes=1 fremdes=0; admin eigenes=1 fremdes=1;
--     kundenbetreuer (staff, nicht admin) fremdes=0  -> keine Schreib-Ausweitung auf staff.
--   Advisor: profiles multiple_permissive_policies-Combos 3 -> 0.

-- 1. DELETE-Zweig von admin_full als eigene Policy retten (vor dem DROP).
CREATE POLICY profiles_admin_delete ON public.profiles
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- 2. INSERT: admin_full-Zweig (is_admin()) in "Profil erstellen" einfalten.
ALTER POLICY "Profil erstellen" ON public.profiles
  WITH CHECK (((id = (SELECT auth.uid())) OR (SELECT public.is_admin())));

-- 3. Redundante Policies entfernen.
--    "Profil lesen"  -> vollstaendig subsumiert von staff_read_all
--    admin_full      -> SELECT subsumiert; INSERT/UPDATE/DELETE oben abgedeckt
DROP POLICY "Profil lesen" ON public.profiles;
DROP POLICY admin_full ON public.profiles;

-- 4. Nachbedingung: je (command) genau 1 permissive Policy fuer authenticated, keine ALL mehr.
DO $chk$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(cmd || '=' || n, ', ') INTO v_bad
  FROM (
    SELECT c.cmd, count(*) AS n
    FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) c(cmd)
    LEFT JOIN pg_policies p
      ON p.schemaname='public' AND p.tablename='profiles' AND p.permissive='PERMISSIVE'
     AND (p.cmd = c.cmd OR p.cmd = 'ALL')
     AND p.roles::text[] && ARRAY['public','authenticated']
    GROUP BY c.cmd
  ) x
  WHERE n <> 1;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'profiles-dedup: erwartet genau 1 permissive Policy je command, gefunden: %', v_bad;
  END IF;
END
$chk$;
