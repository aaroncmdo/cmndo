-- Performance-Welle — RLS initplan optimization.
--
-- Audit: docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13.md (LOW §4.1)
--
-- 234 Policies hatten direkte auth.uid()/auth.jwt()/auth.role()-Calls in
-- ihren USING/WITH-CHECK-Expressions. Postgres-Planner kann diese nicht
-- stabil cachen → Funktion läuft pro Row. Bei großen Tabellen
-- (faelle/leads/claims) ergibt das spürbare Latenz auf SELECT-Heavy-Queries.
--
-- Fix-Pattern (Supabase Best-Practice):
--   USING (auth.uid() = user_id)       -- evaluiert pro Row
--   → USING ((select auth.uid()) = user_id)  -- evaluiert einmal pro Query
--
-- Die `(select ...)`-Subquery wird vom Planner als InitPlan erkannt und
-- exakt einmal gemacht — Result wird gecached.
--
-- Approach: ALTER POLICY (atomar, bewahrt policy-identity) statt DROP/CREATE.
-- Regex-Replacement: 'auth.(uid|jwt|role)()' → '(select auth.\1())'.
-- Identifiziert via Negativ-Lookbehind dass die Funktion noch nicht im
-- (select …)-Wrapper steht.
--
-- Behavior-Change: keiner — semantisch identisches Resultat, nur Plan-Form
-- ist anders (1× InitPlan-Aufruf statt N× pro Row).
--
-- Scope:
--   • 234 Policies über ~70 Tabellen
--   • alle Hot-Spots erfasst (faelle, leads, claims, tasks, nachrichten,
--     gutachten, gutachter_termine, sachverstaendige, etc.)
--   • btree_gist-Extension-Policies NICHT angefasst (nur public-Tabellen).
--
-- Verify post-apply:
--   select count(*) from pg_policies
--   where schemaname='public'
--     and ((qual ~* 'auth\.(uid|jwt|role)\(\)' and qual !~* '\(\s*select\s+auth\.')
--      or (with_check ~* 'auth\.(uid|jwt|role)\(\)' and with_check !~* '\(\s*select\s+auth\.'));
--   → 0

DO $$
DECLARE
  pol record;
  alter_sql text;
  fixed_count integer := 0;
BEGIN
  FOR pol IN
    SELECT
      tablename, policyname,
      qual, with_check,
      regexp_replace(qual, 'auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g') AS new_qual,
      regexp_replace(with_check, 'auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g') AS new_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual ~* 'auth\.(uid|jwt|role)\(\)' AND qual !~* '\(\s*select\s+auth\.')
        OR (with_check ~* 'auth\.(uid|jwt|role)\(\)' AND with_check !~* '\(\s*select\s+auth\.')
      )
  LOOP
    alter_sql := 'ALTER POLICY ' || quote_ident(pol.policyname) || ' ON public.' || quote_ident(pol.tablename);
    IF pol.qual IS NOT NULL THEN
      alter_sql := alter_sql || ' USING (' || pol.new_qual || ')';
    END IF;
    IF pol.with_check IS NOT NULL THEN
      alter_sql := alter_sql || ' WITH CHECK (' || pol.new_check || ')';
    END IF;
    EXECUTE alter_sql;
    fixed_count := fixed_count + 1;
  END LOOP;
  RAISE NOTICE 'Fixed % policies', fixed_count;
END $$;
