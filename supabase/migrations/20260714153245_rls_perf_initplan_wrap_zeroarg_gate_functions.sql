-- Perf-RLS Slice 2b: initplan-wrap fuer 0-arg STABLE SECURITY-DEFINER Gate-Funktionen.
--
-- Problem: is_admin()/is_staff()/... stehen bare in RLS-Quals. SECURITY-DEFINER-Funktionen
-- werden von Postgres NIE geinlined -> pro Zeile ein opaker Funktionsaufruf, der intern
-- jeweils einen Index-Scan auf profiles faehrt. Der Advisor-Lint auth_rls_initplan erfasst
-- nur auth.*/current_setting() und ist fuer diese Aufrufe blind.
--
-- Fix: f() -> (SELECT f()). Alle betroffenen Funktionen sind STABLE und 0-arg (keine
-- Korrelation) -> Postgres hebt sie in einen LAZY InitPlan (einmal pro Query statt pro Zeile).
-- STABLE garantiert innerhalb eines Statements dasselbe Ergebnis -> semantisch identisch.
-- Gemessen auf prod (5000 Zeilen, identisches Resultat): 87.3ms -> 3.2ms (27x).
--
-- Vorgehen bewusst als Transformation (nicht 85 ausgeschriebene ALTER POLICY): der Rewrite
-- ist rein mechanisch, wird aus pg_policies deterministisch abgeleitet und durch Vor-/
-- Nachbedingung fail-closed abgesichert. Kein Doppel-Wrap moeglich (Vorbedingung).
--
-- Zusaetzlicher Grund fuer die Transformation: die Permissive-Konsolidierungen
-- 20260714143649 (reparatur_termine) + 20260714144724 (faelle_claim_bridge) sind auf prod
-- appliziert, aber noch nicht auf staging gemergt. Ausgeschriebene ALTER POLICY auf die dort
-- erzeugten Policy-Namen wuerden auf einer frischen staging-DB mit "policy does not exist"
-- brechen. Die Transformation wrappt, was jeweils existiert -- und da beide Versionen vor
-- dieser hier sortieren, bleibt die Reihenfolge in jedem Replay korrekt.
--
-- Verifiziert auf prod (paizkjajbuxxksdoycev): 85 Policies / 56 Tabellen / 124 Calls
-- gewrappt, bare_remaining=0, policies_public_total unveraendert 345,
-- auth.uid() unveraendert 375/375 gewrappt. Echt-Auth-Smoke (Regel 4) ueber 8 Rollen
-- (admin/sv/makler/werkstatt/kundenbetreuer/dispatch/kanzlei/anon): Sichtbarkeit identisch.

DO $mig$
DECLARE
  v_fns  text[] := ARRAY['is_admin','is_staff','is_dispatcher','is_kanzlei','is_kundenbetreuer',
                         'is_sv','get_sv_id','auth_user_firma_id','auth_flottenmanager_firma_id'];
  v_pat  text   := '\m(is_admin|is_staff|is_dispatcher|is_kanzlei|is_kundenbetreuer|is_sv|get_sv_id|auth_user_firma_id|auth_flottenmanager_firma_id)\(\)';
  v_todo jsonb;
  v_item jsonb;
  v_sql  text;
  v_n    int := 0;
  v_bad  bigint;
BEGIN
  -- Vorbedingung: nichts darf bereits gewrappt sein (sonst Doppel-Wrap).
  SELECT count(*) INTO v_bad
  FROM pg_policies p, unnest(v_fns) f
  WHERE p.schemaname = 'public'
    AND (coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'')) ~ ('SELECT ' || f || '\(\) AS');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'initplan-wrap: % bereits gewrappte Vorkommen -> Abbruch (nicht idempotent)', v_bad;
  END IF;

  -- Arbeitsliste VOLLSTAENDIG materialisieren, bevor irgendein ALTER den Katalog anfasst.
  SELECT coalesce(jsonb_agg(jsonb_build_object('t', tablename, 'p', policyname, 'q', qual, 'c', with_check)
                            ORDER BY tablename, policyname), '[]'::jsonb)
    INTO v_todo
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ v_pat;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_todo) LOOP
    v_sql := format('ALTER POLICY %I ON public.%I', v_item->>'p', v_item->>'t');
    IF v_item->>'q' IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', regexp_replace(v_item->>'q', v_pat, '(SELECT \1())', 'g'));
    END IF;
    IF v_item->>'c' IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', regexp_replace(v_item->>'c', v_pat, '(SELECT \1())', 'g'));
    END IF;
    EXECUTE v_sql;
    v_n := v_n + 1;
  END LOOP;

  -- Nachbedingung: kein bares Vorkommen darf uebrig bleiben (bare = total - gewrappt).
  SELECT coalesce(sum(
           regexp_count(coalesce(p.qual,'') || ' ' || coalesce(p.with_check,''), '\m' || f || '\(\)')
         - regexp_count(coalesce(p.qual,'') || ' ' || coalesce(p.with_check,''), 'SELECT ' || f || '\(\) AS')
         ), 0)
    INTO v_bad
  FROM pg_policies p, unnest(v_fns) f
  WHERE p.schemaname = 'public';

  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'initplan-wrap unvollstaendig: % bare Calls uebrig', v_bad;
  END IF;

  RAISE NOTICE 'initplan-wrap: % Policies umgeschrieben, 0 bare Calls uebrig', v_n;
END
$mig$;
