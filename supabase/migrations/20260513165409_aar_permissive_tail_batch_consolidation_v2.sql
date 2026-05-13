-- Performance — PERMISSIVE-Policy-Konsolidierung Tail-Batch (28 Tabellen).
--
-- Audit: docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13.md (LOW §4.2)
--
-- Schließt die letzten 28 Tabellen mit je 1 redundantem PERMISSIVE-Slot.
-- Automatisierte Slot-Konsolidierung via PL/pgSQL-Block:
--   • Iteriert über alle (tablename, cmd, role)-Tupel mit count(*) > 1
--   • Pro Slot: alle Policies droppen, eine konsolidierte mit OR-
--     Verkettung der USING + WITH CHECK Expressions erstellen
--   • Naming: <table>_<cmd>_<role>_consol (auf 63 Zeichen gekappt)
--   • Sonderfall INSERT: nur WITH CHECK, kein USING (Postgres-Constraint)
--
-- Idempotenz: DROP POLICY IF EXISTS. Bei Re-Run findet der Loop keine
-- doppel-Slots mehr und macht nichts.
--
-- Behavior-Change: keiner — OR-Verkettung pro Slot ist semantisch identisch
-- zu Postgres-internem OR über mehrere PERMISSIVE-Policies.
--
-- Verify post-apply:
--   select count(*) from (
--     select tablename, cmd, unnest(roles) from pg_policies
--     where schemaname='public' and permissive='PERMISSIVE'
--     group by 1,2,3 having count(*) > 1
--   ) s;
--   → 0

DO $$
DECLARE
  slot_rec record;
  pol_rec record;
  combined_using text;
  combined_check text;
  has_check boolean;
  new_policy_name text;
  create_sql text;
  policies_in_slot text[];
BEGIN
  FOR slot_rec IN
    SELECT tablename, cmd::text AS cmd_txt, unnest(roles) AS role_name
    FROM pg_policies
    WHERE schemaname='public' AND permissive='PERMISSIVE'
    GROUP BY tablename, cmd, unnest(roles)
    HAVING count(*) > 1
    ORDER BY tablename, cmd, unnest(roles)
  LOOP
    combined_using := '';
    combined_check := '';
    has_check := false;
    policies_in_slot := ARRAY[]::text[];

    FOR pol_rec IN
      SELECT policyname, qual, with_check
      FROM pg_policies
      WHERE schemaname='public' AND tablename=slot_rec.tablename
        AND cmd::text=slot_rec.cmd_txt AND slot_rec.role_name = ANY(roles)
        AND permissive='PERMISSIVE'
      ORDER BY policyname
    LOOP
      policies_in_slot := policies_in_slot || pol_rec.policyname;
      IF pol_rec.qual IS NOT NULL THEN
        IF combined_using = '' THEN
          combined_using := '(' || pol_rec.qual || ')';
        ELSE
          combined_using := combined_using || ' OR (' || pol_rec.qual || ')';
        END IF;
      END IF;
      IF pol_rec.with_check IS NOT NULL THEN
        IF NOT has_check THEN
          combined_check := '(' || pol_rec.with_check || ')';
          has_check := true;
        ELSE
          combined_check := combined_check || ' OR (' || pol_rec.with_check || ')';
        END IF;
      END IF;
    END LOOP;

    new_policy_name := left(slot_rec.tablename, 40) || '_' || lower(slot_rec.cmd_txt) || '_' || slot_rec.role_name || '_consol';
    new_policy_name := substring(new_policy_name from 1 for 63);

    FOR pol_rec IN
      SELECT unnest(policies_in_slot) AS pname
    LOOP
      EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol_rec.pname) || ' ON public.' || quote_ident(slot_rec.tablename);
    END LOOP;

    create_sql := 'CREATE POLICY ' || quote_ident(new_policy_name) || ' ON public.' || quote_ident(slot_rec.tablename)
      || ' FOR ' || slot_rec.cmd_txt || ' TO ' || quote_ident(slot_rec.role_name);
    IF slot_rec.cmd_txt = 'INSERT' THEN
      IF has_check THEN
        create_sql := create_sql || ' WITH CHECK (' || combined_check || ')';
      ELSE
        create_sql := create_sql || ' WITH CHECK (true)';
      END IF;
    ELSE
      IF combined_using = '' THEN combined_using := 'true'; END IF;
      create_sql := create_sql || ' USING (' || combined_using || ')';
      IF has_check THEN
        create_sql := create_sql || ' WITH CHECK (' || combined_check || ')';
      END IF;
    END IF;
    EXECUTE create_sql;
    RAISE NOTICE 'Consolidated %.% [%]: % policies -> 1',
      slot_rec.tablename, slot_rec.cmd_txt, slot_rec.role_name, array_length(policies_in_slot, 1);
  END LOOP;
END $$;
