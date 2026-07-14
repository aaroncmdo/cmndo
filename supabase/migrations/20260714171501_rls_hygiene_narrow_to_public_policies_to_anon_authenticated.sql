-- B2a — Advisor-Hygiene (KEIN Perf-Effekt): PERMISSIVE `TO public`-Policies im public-Schema
-- auf `TO anon, authenticated` verengen.
--
-- WARUM
-- Der Supabase-Advisor-Lint `multiple_permissive_policies` zaehlt (Tabelle x Rolle x Action) und
-- matcht eine Policy fuer eine Rolle, wenn die Rolle in p.roles steht ODER p.roles 'public'
-- enthaelt. Die 39 ueberlappenden (Tabelle, Action)-Paare mit >=2 `TO public`-Policies faechern
-- damit ueber 4 Rollen OHNE App-Traffic auf: authenticator / cli_login_postgres / dashboard_user
-- / supabase_privileged_role — je exakt 39 Findings = 156 von 313 (49 % Rauschen).
-- Verengen loescht diese 156, OHNE eine einzige qual anzufassen. Ziel: kuenftige echte
-- Advisor-Findings bleiben sichtbar. Perf-Effekt = 0 (Postgres flacht permissive Policies
-- ohnehin zu EINEM OR-Filter auf EINEM Scan ab — per EXPLAIN auf prod widerlegte Praemisse).
--
-- WARUM DAS EIN BEWEISBARER NO-OP IST (auf prod gemessen 14.07.)
-- Der Cluster hat genau 18 Nicht-System-Rollen. Vollstaendige Partition:
--   * 6 Rollen mit rolbypassrls=true (admin, postgres, service_role, supabase_admin,
--     supabase_etl_admin, supabase_read_only_user) -> RLS wird nie evaluiert, TO-Klausel egal.
--   * 10 Rollen mit NULL Grants auf ALLEN 82 betroffenen Tabellen (authenticator,
--     cli_login_postgres, dashboard_user, pgbouncer, supabase_auth_admin,
--     supabase_functions_admin, supabase_privileged_role, supabase_realtime_admin,
--     supabase_replication_admin, supabase_storage_admin) -> koennen die Tabellen gar nicht
--     lesen/schreiben; Policy irrelevant. Geprueft per has_table_privilege (deckt via
--     Rollen-Mitgliedschaft geerbte Grants mit ab) UND pg_attribute.attacl (einziger
--     Column-Grantee in `public` ist `anon` — und der bleibt drin).
--   * 2 Rollen bleiben explizit in der neuen TO-Klausel: anon, authenticated.
-- Postgres' check_role_for_policy nutzt has_privs_of_role (vererbungs-bewusst); ausser
-- postgres/supabase_admin (beide bypassrls) erbt keine Rolle anon oder authenticated.
-- => Verhalten fuer JEDE Rolle identisch. `anon` behaelt exakt seinen heutigen Zugriff:
--    das hier ist Hygiene, KEINE Rechte-Aenderung. (Ein etwaiger anon-Entzug waere eine
--    separate Sicherheits-Entscheidung und gehoert nicht in einen Hygiene-PR. Bewusste
--    Abweichung vom Handoff-Vorschlag `TO public -> TO authenticated`: der haette anon
--    entzogen und damit auf 138 Policies still das Verhalten geaendert — auf Tabellen wie
--    organisationen/vehicles z.B. von hartem 42501 zu leerem Result.)
--
-- ABGRENZUNG
-- RESTRICTIVE-Policies bleiben unangetastet (1 Stueck, TO public) — eine Verengung waere dort
-- eine LOCKERUNG der Restriktion. Policies, die 'public' mit anderen Rollen mischen: 0 auf prod
-- (geprueft) -> der Exact-Match-Filter ist vollstaendig.
--
-- TRANSFORMATION statt ausgeschriebener ALTER-POLICY-Liste: Policy-Namen driften zwischen prod
-- und einem frischen Replay (Fremd-Lanes, noch nicht gemergte Konsolidierungen). Ein
-- ausgeschriebener Namensblock braeche auf einer frischen DB mit "policy does not exist".
DO $$
DECLARE
  tbls      text[];
  pols      text[];
  i         int;
  n_changed int := 0;
  n_left    int;
BEGIN
  -- Locks auf 82 Tabellen auf einer LIVE-prod-DB: lieber schnell scheitern + retry als
  -- eine Lock-Pileup-Kaskade (alle bereits gealterten Tabellen blieben sonst bis Commit gelockt).
  PERFORM set_config('lock_timeout', '5s', true);

  -- Arbeitsliste VORHER materialisieren — nicht ueber den Katalog iterieren, waehrend man ihn aendert.
  -- Beide array_agg identisch sortiert => die Arrays sind parallel/aligned.
  SELECT array_agg(tablename  ORDER BY tablename, policyname),
         array_agg(policyname ORDER BY tablename, policyname)
    INTO tbls, pols
  FROM pg_policies
  WHERE schemaname = 'public'
    AND permissive = 'PERMISSIVE'
    AND roles::text[] = ARRAY['public'];

  IF tbls IS NOT NULL THEN
    FOR i IN 1 .. array_length(tbls, 1) LOOP
      EXECUTE format('ALTER POLICY %I ON public.%I TO anon, authenticated', pols[i], tbls[i]);
      n_changed := n_changed + 1;
    END LOOP;
  END IF;

  -- Nachbedingung fail-closed: keine PERMISSIVE TO-public-Policy darf uebrig bleiben.
  SELECT count(*) INTO n_left
  FROM pg_policies
  WHERE schemaname = 'public'
    AND permissive = 'PERMISSIVE'
    AND roles::text[] = ARRAY['public'];

  IF n_left <> 0 THEN
    RAISE EXCEPTION 'B2a fail-closed: % PERMISSIVE TO-public-Policies verblieben (erwartet 0)', n_left;
  END IF;

  RAISE NOTICE 'B2a: % Policies auf (anon, authenticated) verengt', n_changed;
END $$;
