-- Nachzuegler-Hygiene: die PERMISSIVE `TO public`-Policies, die NACH B2a (20260714171501)
-- neu entstanden sind, auf `TO anon, authenticated` verengen.
--
-- WARUM: `TO public` ist der Postgres-DEFAULT, wenn man die `TO`-Klausel weglaesst. B2a hatte
-- permissive TO-public auf 0 gebracht; binnen Stunden waren es wieder 4 (cold_mail_enrollments/
-- _sequenzen/_steps/_vorlagen — die cold-mailer-Lane hat die TO-Klausel schlicht vergessen).
-- `TO public` faechert ueber ALLE Cluster-Rollen auf, auch ueber authenticator/cli_login_postgres/
-- dashboard_user/supabase_privileged_role (0 App-Traffic, 0 Grants). Der Advisor zaehlt je
-- (Tabelle x ROLLE x Action) -> sobald eine dieser Tabellen eine ZWEITE Policy bekommt, faechert
-- der Overlap sofort 4x auf. Heute noch harmlos (je 1 Policy/Tabelle -> kein Overlap), aber latent.
-- Das CI-Gate `check:rls-policies` (PR #4337) verhindert kuenftige; dieser PR raeumt den Bestand.
--
-- BEWEISBARER NO-OP (Rollen-Partition auf prod gemessen, identisch zu B2a):
--   * 6 Rollen mit rolbypassrls=true -> RLS wird nie evaluiert, TO-Klausel egal.
--   * 10 Rollen mit 0 Grants auf diesen Tabellen -> koennen sie gar nicht lesen/schreiben.
--   * anon + authenticated bleiben explizit in der TO-Klausel -> Zugriff unveraendert.
-- => Verhalten fuer JEDE Rolle identisch. Verifiziert: Policy-Fingerprint ueber alle 471 Policies
--    (ALLE Spalten AUSSER `roles`) vor/nach BYTE-IDENTISCH (ab52c7297b5cd14fa51b2c5effb58220);
--    permissive TO-public 4 -> 0; Advisor multiple_permissive_policies bleibt 0.
--
-- RESTRICTIVE BLEIBT UNANGETASTET: bei einer restriktiven Policy ist `TO public` KORREKT
-- (gilt fuer alle Rollen = maximale Abdeckung); verengen wuerde die Restriktion LOCKERN.
-- Der Block filtert strikt auf permissive='PERMISSIVE' und wirft, falls die eine RESTRICTIVE
-- TO-public-Policy (nachrichten_thread_insert_member_only) verschwindet.
--
-- TRANSFORMATION statt ausgeschriebener Namensliste: Policy-Namen driften zwischen prod und
-- einem frischen Replay (Fremd-Lanes) -> ein Namensblock braeche mit "policy does not exist".
DO $$
DECLARE
  v_tbls text[]; v_pols text[]; i int; n_changed int := 0; n_left int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  SELECT array_agg(tablename  ORDER BY tablename, policyname),
         array_agg(policyname ORDER BY tablename, policyname)
    INTO v_tbls, v_pols
  FROM pg_policies
  WHERE schemaname='public' AND permissive='PERMISSIVE' AND roles::text[] = ARRAY['public'];

  IF v_tbls IS NOT NULL THEN
    FOR i IN 1 .. array_length(v_tbls, 1) LOOP
      EXECUTE format('ALTER POLICY %I ON public.%I TO anon, authenticated', v_pols[i], v_tbls[i]);
      n_changed := n_changed + 1;
    END LOOP;
  END IF;

  -- Nachbedingung fail-closed: keine PERMISSIVE TO-public-Policy darf uebrig bleiben.
  SELECT count(*) INTO n_left FROM pg_policies
  WHERE schemaname='public' AND permissive='PERMISSIVE' AND roles::text[] = ARRAY['public'];
  IF n_left <> 0 THEN
    RAISE EXCEPTION 'Nachzuegler-Hygiene fail-closed: % permissive TO-public-Policies verblieben', n_left;
  END IF;

  -- Und die RESTRICTIVE TO-public muss UEBERLEBEN (verengen waere ein LOCKERN).
  IF (SELECT count(*) FROM pg_policies
        WHERE schemaname='public' AND permissive='RESTRICTIVE' AND roles::text[] = ARRAY['public']) <> 1 THEN
    RAISE EXCEPTION 'RESTRICTIVE TO-public-Policy wurde angetastet — das waere eine LOCKERUNG!';
  END IF;

  RAISE NOTICE 'Nachzuegler: % permissive Policies auf (anon, authenticated) verengt', n_changed;
END $$;
