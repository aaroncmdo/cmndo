-- B1 Advisor-Hygiene (KEIN Perf-Effekt): pro Zieltabelle die PERMISSIVE-Policies auf
-- <=1 Policy je (Rolle, Command) normalisieren; qual = OR jeder original-anwendbaren Policy.
-- Postgres OR-verknuepft permissive Policies -> semantischer No-op je (Rolle,Command) by construction.
-- Beitragsregeln:
--   USING(C in SELECT/UPDATE/DELETE) <- qual der Policies mit cmd in {C, ALL} (INSERT.qual NULL -> raus)
--   CHECK(C in INSERT/UPDATE)        <- coalesce(with_check, qual) der Policies mit cmd in {C, ALL}
--     (UPDATE/ALL null with_check -> "defaults to USING"-Regel; INSERT with_check stets non-null)
-- anon+authenticated werden zu EINER Policy kombiniert gdw. identische Term-Mengen, sonst je Rolle
-- gesplittet. Aggregationen schliessen frisch erzeugte __b1-Policies aus (create-as-you-go korrekt).
-- SELBST-VERIFIZIEREND & FAIL-CLOSED: nach dem Merge werden Struktur (<=1 Policy je Rolle/Command)
-- und Containment (jeder Original-Pradikat je Rolle/Command noch vorhanden) geprueft; Verstoss ->
-- RAISE -> Transaktion bricht ab -> prod unveraendert.

-- Go-Live-Sicherheit: 59/13/1 Tabellen kurz ACCESS EXCLUSIVE gelockt -> lieber schnell scheitern
-- + retry als eine Lock-Pileup-Kaskade blockieren.
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _b1_orig ON COMMIT DROP AS
  SELECT tablename, policyname, cmd, roles::text[] AS roles, qual, with_check
  FROM pg_policies
  WHERE schemaname='public' AND permissive='PERMISSIVE' AND tablename = ANY(ARRAY['claim_parties','claims','fall_dokumente','gutachter_finder_anfragen','gutachter_termine','leads','pflichtdokumente','phase_transitions','qc_checkliste','sachverstaendige','sv_kalender_events_cache','timeline','vehicles']);

CREATE OR REPLACE FUNCTION public._b1_emit(p_table text, p_cmd text, p_cs text, p_suffix text,
                                           p_roles text, p_using text, p_check text) RETURNS void AS $f$
DECLARE nm text := p_table || '__b1' || p_cs || p_suffix;
BEGIN
  IF    p_cmd='SELECT' THEN EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO %s USING (%s)', nm, p_table, p_roles, p_using);
  ELSIF p_cmd='DELETE' THEN EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR DELETE TO %s USING (%s)', nm, p_table, p_roles, p_using);
  ELSIF p_cmd='INSERT' THEN EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR INSERT TO %s WITH CHECK (%s)', nm, p_table, p_roles, p_check);
  ELSE                      EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR UPDATE TO %s USING (%s) WITH CHECK (%s)', nm, p_table, p_roles, p_using, p_check);
  END IF;
END $f$ LANGUAGE plpgsql;

DO $b1$
DECLARE
  v_tables text[] := ARRAY['claim_parties','claims','fall_dokumente','gutachter_finder_anfragen','gutachter_termine','leads','pflichtdokumente','phase_transitions','qc_checkliste','sachverstaendige','sv_kalender_events_cache','timeline','vehicles'];
  v_cmds text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE'];
  v_t text; v_cmd text; v_cs text; v_pol text;
  v_u_an text; v_u_au text; v_c_an text; v_c_au text;
  v_has_an boolean; v_has_au boolean; v_same boolean;
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    FOREACH v_cmd IN ARRAY v_cmds LOOP
      v_cs := CASE v_cmd WHEN 'SELECT' THEN 'sel' WHEN 'INSERT' THEN 'ins' WHEN 'UPDATE' THEN 'upd' ELSE 'del' END;
      v_u_an := NULL; v_u_au := NULL; v_c_an := NULL; v_c_au := NULL;

      IF v_cmd IN ('SELECT','UPDATE','DELETE') THEN
        SELECT string_agg(DISTINCT '('||p.qual||')', ' OR ') INTO v_u_an FROM pg_policies p
          WHERE p.schemaname='public' AND p.tablename=v_t AND p.permissive='PERMISSIVE'
            AND p.policyname NOT LIKE '%\_\_b1%' AND p.qual IS NOT NULL
            AND 'anon' = ANY(p.roles::text[]) AND (p.cmd=v_cmd OR p.cmd='ALL');
        SELECT string_agg(DISTINCT '('||p.qual||')', ' OR ') INTO v_u_au FROM pg_policies p
          WHERE p.schemaname='public' AND p.tablename=v_t AND p.permissive='PERMISSIVE'
            AND p.policyname NOT LIKE '%\_\_b1%' AND p.qual IS NOT NULL
            AND 'authenticated' = ANY(p.roles::text[]) AND (p.cmd=v_cmd OR p.cmd='ALL');
      END IF;

      IF v_cmd IN ('INSERT','UPDATE') THEN
        SELECT string_agg(DISTINCT '('||coalesce(p.with_check,p.qual)||')', ' OR ') INTO v_c_an FROM pg_policies p
          WHERE p.schemaname='public' AND p.tablename=v_t AND p.permissive='PERMISSIVE'
            AND p.policyname NOT LIKE '%\_\_b1%'
            AND 'anon' = ANY(p.roles::text[]) AND (p.cmd=v_cmd OR p.cmd='ALL');
        SELECT string_agg(DISTINCT '('||coalesce(p.with_check,p.qual)||')', ' OR ') INTO v_c_au FROM pg_policies p
          WHERE p.schemaname='public' AND p.tablename=v_t AND p.permissive='PERMISSIVE'
            AND p.policyname NOT LIKE '%\_\_b1%'
            AND 'authenticated' = ANY(p.roles::text[]) AND (p.cmd=v_cmd OR p.cmd='ALL');
      END IF;

      v_has_an := (v_cmd='INSERT' AND v_c_an IS NOT NULL) OR (v_cmd<>'INSERT' AND v_u_an IS NOT NULL);
      v_has_au := (v_cmd='INSERT' AND v_c_au IS NOT NULL) OR (v_cmd<>'INSERT' AND v_u_au IS NOT NULL);
      v_same   := (v_u_an IS NOT DISTINCT FROM v_u_au) AND (v_c_an IS NOT DISTINCT FROM v_c_au);

      IF v_has_an AND v_has_au AND v_same THEN
        PERFORM public._b1_emit(v_t, v_cmd, v_cs, '', 'anon, authenticated', v_u_an, v_c_an);
      ELSE
        IF v_has_an THEN PERFORM public._b1_emit(v_t, v_cmd, v_cs, '_an', 'anon', v_u_an, v_c_an); END IF;
        IF v_has_au THEN PERFORM public._b1_emit(v_t, v_cmd, v_cs, '_au', 'authenticated', v_u_au, v_c_au); END IF;
      END IF;
    END LOOP;

    FOR v_pol IN SELECT p.policyname FROM pg_policies p
                 WHERE p.schemaname='public' AND p.tablename=v_t AND p.permissive='PERMISSIVE' AND p.policyname NOT LIKE '%\_\_b1%'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', v_pol, v_t);
    END LOOP;
  END LOOP;
END $b1$;

DO $v$
DECLARE v_bad text;
BEGIN
  -- (1) STRUKTUR: kein (table,role,cmd) mit >1 permissive Policy
  SELECT string_agg(tablename||'/'||rl||'/'||cx, ', ') INTO v_bad FROM (
    SELECT p.tablename, rl, cx
    FROM pg_policies p
      CROSS JOIN LATERAL unnest(p.roles::text[]) rl
      CROSS JOIN LATERAL unnest(CASE WHEN p.cmd='ALL' THEN ARRAY['SELECT','INSERT','UPDATE','DELETE'] ELSE ARRAY[p.cmd] END) cx
    WHERE p.schemaname='public' AND p.tablename = ANY(ARRAY['claim_parties','claims','fall_dokumente','gutachter_finder_anfragen','gutachter_termine','leads','pflichtdokumente','phase_transitions','qc_checkliste','sachverstaendige','sv_kalender_events_cache','timeline','vehicles']) AND p.permissive='PERMISSIVE' AND rl IN ('anon','authenticated')
    GROUP BY 1,2,3 HAVING count(*)>1
  ) x;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'B1 STRUKTUR >1 Policy: %', v_bad; END IF;

  -- (2) USING-CONTAINMENT: jeder Original-USING-Pradikat je (table,role,cmd) im neuen Policy-qual enthalten
  SELECT string_agg(DISTINCT tablename||'/'||policyname||'/'||rl||'/'||cx, ', ') INTO v_bad FROM (
    SELECT o.tablename, o.policyname, rl, cx, o.qual AS atom
    FROM _b1_orig o
      CROSS JOIN LATERAL unnest(o.roles) rl
      CROSS JOIN LATERAL unnest(CASE WHEN o.cmd='ALL' THEN ARRAY['SELECT','UPDATE','DELETE']
                                     WHEN o.cmd IN ('SELECT','UPDATE','DELETE') THEN ARRAY[o.cmd]
                                     ELSE ARRAY[]::text[] END) cx
    WHERE o.qual IS NOT NULL AND rl IN ('anon','authenticated')
  ) o
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies np WHERE np.schemaname='public' AND np.tablename=o.tablename
      AND np.permissive='PERMISSIVE' AND np.policyname LIKE '%\_\_b1%'
      AND o.rl = ANY(np.roles::text[]) AND np.cmd=o.cx AND np.qual IS NOT NULL
      AND position(regexp_replace(o.atom,'[\s()]','','g') in regexp_replace(np.qual,'[\s()]','','g'))>0
  );
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'B1 USING-Containment verloren: %', v_bad; END IF;

  -- (3) CHECK-CONTAINMENT
  SELECT string_agg(DISTINCT tablename||'/'||policyname||'/'||rl||'/'||cx, ', ') INTO v_bad FROM (
    SELECT o.tablename, o.policyname, rl, cx, coalesce(o.with_check,o.qual) AS atom
    FROM _b1_orig o
      CROSS JOIN LATERAL unnest(o.roles) rl
      CROSS JOIN LATERAL unnest(CASE WHEN o.cmd='ALL' THEN ARRAY['INSERT','UPDATE']
                                     WHEN o.cmd='INSERT' THEN ARRAY['INSERT']
                                     WHEN o.cmd='UPDATE' THEN ARRAY['UPDATE']
                                     ELSE ARRAY[]::text[] END) cx
    WHERE rl IN ('anon','authenticated') AND coalesce(o.with_check,o.qual) IS NOT NULL
  ) o
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies np WHERE np.schemaname='public' AND np.tablename=o.tablename
      AND np.permissive='PERMISSIVE' AND np.policyname LIKE '%\_\_b1%'
      AND o.rl = ANY(np.roles::text[]) AND np.cmd=o.cx AND np.with_check IS NOT NULL
      AND position(regexp_replace(o.atom,'[\s()]','','g') in regexp_replace(np.with_check,'[\s()]','','g'))>0
  );
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'B1 CHECK-Containment verloren: %', v_bad; END IF;
END $v$;

DROP FUNCTION public._b1_emit(text, text, text, text, text, text, text);
