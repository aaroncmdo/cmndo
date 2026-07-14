-- consent_records_insert war eine tote, faelschungs-ermoeglichende Policy.
-- Analyse (Session 6643dd30 -> COORDINATION-rls-perf-2b-und-consent-records), Aaron-Freigabe 14.07.:
--   * Einzige Policy der Tabelle: INSERT / {anon,authenticated} / WITH CHECK = true (unbeschraenkt).
--   * Kein SELECT/UPDATE/DELETE-Policy -> RLS verweigert alle Reads (Read-Seite dicht).
--   * Die App nutzt die Policy nie: einziger Writer ist src/app/api/consent/route.ts via
--     createAdminClient() = service_role -> bypasst RLS komplett.
--   * Effekt heute: jeder anon kann per PostgREST beliebige Zeilen in den DSGVO-Consent-Nachweis
--     schreiben (frei waehlbare categories/policy_version/user_agent). rows_now = 0.
-- DROP = No-op fuer die App (service_role bypasst RLS), schliesst den Faelschungsvektor,
-- raeumt den Advisor-WARN `rls_policy_always_true` weg.
DROP POLICY IF EXISTS consent_records_insert ON public.consent_records;

-- Defense-in-Depth: die INSERT/SELECT-Grants sind ohne Policy ohnehin wirkungslos
-- (RLS default-deny) -> REVOKE kann das Verhalten nicht ueber den DROP hinaus aendern,
-- entfernt aber die inerte Angriffsflaeche im Katalog.
REVOKE INSERT, SELECT ON public.consent_records FROM anon, authenticated;

-- Fail-closed Nachbedingung: keine Policy mehr auf der Tabelle, RLS bleibt aktiv (default-deny).
DO $chk$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='consent_records';
  IF n <> 0 THEN RAISE EXCEPTION 'consent_records: erwartet 0 Policies nach DROP, gefunden %', n; END IF;
END $chk$;
