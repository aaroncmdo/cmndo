-- Globale Suche: Kanzlei-Zweig in die Claim-RLS (Root-Fix Teil 2, Aaron-Entscheid 14.07.).
--
-- BEFUND: search_global ist SECURITY INVOKER -> RLS ist das Gate. claims__b1sel_au kannte
-- KEINEN kanzlei-Zweig (nur admin / KB / dispatcher-own-lead / geschaedigter / claim_party / SV)
-- -> die Kanzlei-Suche fand garantiert NICHTS. Deshalb war die Kanzlei-Palette in PR #4317
-- bewusst nicht verdrahtet ("leere Suche ist schlechter als keine").
--
-- WARUM DREI TABELLEN: der Personen-Zweig des RPC joint personen -> claim_parties -> claims,
-- der Fahrzeug-Zweig vehicles -> claims. Bei SECURITY INVOKER muss RLS auf ALLEN beteiligten
-- Tabellen durchlassen. claim_parties__b1sel_au und vehicles__b1sel_au kennen kanzlei ebenfalls
-- nicht -> ohne sie haette die Kanzlei eine Suche ohne Mandantenname und ohne Kennzeichen.
-- Fuer eine Kanzlei ist der Mandantenname DER Sucheinstieg -> alle drei.
--
-- GATE == die kanonische Kanzlei-Regel, identisch zu claim_sichtbar_fuer_aktuellen_user()
-- und zur leads-Policy: is_kanzlei() AND claims.service_typ = 'komplett'.
--
-- METHODE: generischer, selbst-verifizierender Block (Muster der RLS-Konsolidierung B1).
-- Die bestehende Qual wird aus dem KATALOG gelesen und nur per OR ergaenzt -> additiv per
-- Konstruktion (kein bestehender Zugriff kann verloren gehen), keine Transkriptionsfehler,
-- idempotent (zweiter Lauf = No-op). Fail-closed: fehlt eine Policy, bricht die Migration ab.
--
-- PERF: initplan-Wrap `(SELECT is_kanzlei())` ist PFLICHT (nicht bare `is_kanzlei()`) -- 0-arg
-- SECDEF-Gates werden sonst PRO ZEILE ausgewertet (Lehre aus dem RLS-Perf-Pass: 87ms -> 3.2ms).
--
-- VERIFIZIERT auf prod als kanzlei-User (Fixture in Transaktion + Rollback, 0 Rueckstaende):
--   A) search_global('CLM-KANZLEI') -> NUR der service_typ='komplett'-Fall; der 'basis'-Fall
--      bleibt unsichtbar (Negativ-Kontrolle).
--   B) search_global('Flowx')       -> "Testkunde Flowcheck" -> komplett-Fall. Dieselbe Person
--      haengt auch am 'basis'-Fall -- der taucht NICHT auf (Gate greift durch claim_parties).
--   C) search_global('HBKZ123x')    -> "HB-KZ-1234" -> komplett-Fall (Fahrzeug-Zweig).
--   D) search_global('Tesst')       -> 0 Zeilen: Kanzlei bekommt KEINE Leads (Rollen-Gate im RPC).

DO $$
DECLARE
  v_specs jsonb := jsonb_build_array(
    jsonb_build_object(
      'tabelle','claims', 'policy','claims__b1sel_au',
      'klausel','((SELECT public.is_kanzlei()) AND claims.service_typ = ''komplett'')'),
    jsonb_build_object(
      'tabelle','claim_parties', 'policy','claim_parties__b1sel_au',
      'klausel','((SELECT public.is_kanzlei()) AND EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_parties.claim_id AND c.service_typ = ''komplett''))'),
    jsonb_build_object(
      'tabelle','vehicles', 'policy','vehicles__b1sel_au',
      'klausel','((SELECT public.is_kanzlei()) AND EXISTS (SELECT 1 FROM public.claims c WHERE c.vehicle_id = vehicles.id AND c.service_typ = ''komplett''))')
  );
  v_spec jsonb;
  v_qual text;
  v_anzahl int;
BEGIN
  FOR v_spec IN SELECT * FROM jsonb_array_elements(v_specs) LOOP
    SELECT pg_get_expr(pol.polqual, pol.polrelid) INTO v_qual
    FROM pg_policy pol
    WHERE pol.polrelid = format('public.%I', v_spec->>'tabelle')::regclass
      AND pol.polname = v_spec->>'policy';

    IF v_qual IS NULL THEN
      RAISE EXCEPTION 'Policy %.% nicht gefunden -- fail-closed',
        v_spec->>'tabelle', v_spec->>'policy';
    END IF;

    IF v_qual ILIKE '%is_kanzlei%' THEN
      RAISE NOTICE 'Policy %.% hat bereits einen kanzlei-Zweig -- uebersprungen',
        v_spec->>'tabelle', v_spec->>'policy';
      CONTINUE;
    END IF;

    EXECUTE format('ALTER POLICY %I ON public.%I USING (%s OR %s)',
      v_spec->>'policy', v_spec->>'tabelle', v_qual, v_spec->>'klausel');
  END LOOP;

  -- Struktur-Check: weiterhin genau EINE authenticated-SELECT-Policy je Tabelle (B1-Invariante).
  SELECT count(*) INTO v_anzahl
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('claims','claim_parties','vehicles')
    AND cmd = 'SELECT'
    AND roles::text LIKE '%authenticated%';
  IF v_anzahl <> 3 THEN
    RAISE EXCEPTION 'Erwartet 3 authenticated-SELECT-Policies (1 je Tabelle), gefunden % -- fail-closed', v_anzahl;
  END IF;

  -- Containment-Check: alle drei Quals tragen jetzt den kanzlei-Zweig.
  SELECT count(*) INTO v_anzahl
  FROM pg_policy pol
  WHERE pol.polrelid IN ('public.claims'::regclass, 'public.claim_parties'::regclass, 'public.vehicles'::regclass)
    AND pol.polname IN ('claims__b1sel_au','claim_parties__b1sel_au','vehicles__b1sel_au')
    AND pg_get_expr(pol.polqual, pol.polrelid) ILIKE '%is_kanzlei%';
  IF v_anzahl <> 3 THEN
    RAISE EXCEPTION 'kanzlei-Zweig fehlt in % von 3 Policies -- fail-closed', 3 - v_anzahl;
  END IF;
END $$;
