-- AAR-914: Defense-in-Depth — REVOKE ALL FROM anon auf allen Finanztabellen
--
-- Hintergrund: AAR-851 (PR #1071) hat 14 Welle-7-Tabellen SELECT-revoked,
-- davon nur claim_payments aus dem Finanz-Cluster. Die anderen 19 Finanz-
-- Tabellen haben aktuell FULL grants für anon (SELECT/INSERT/UPDATE/DELETE).
--
-- RLS-Policies blocken anon zwar funktional (auth.uid() ist NULL → policy
-- liefert 0 rows oder 42501). Aber das ist keine defense-in-depth — wenn eine
-- Policy schief wird oder gedroppt wird, hätte anon plötzlich grant-Level-
-- Zugriff auf finanzkritische Daten.
--
-- Code-Caller-Audit (siehe docs/15.05.2026/abrechnungen-rls-audit.md):
--   - Alle Schreibpfade nutzen createAdminClient() (service_role, bypassed RLS)
--   - Alle Read-Pfade nutzen createClient() (authenticated)
--   - 0 Stellen nutzen anon-Client für Finanztabellen
--   → REVOKE ALL FROM anon ist sicher
--
-- 3 Tabellen sind bereits via AAR-709 (#1065) service_role-only:
--   rechnungs_konfiguration, rechnungs_nr_counter, sv_onboarding_rechnungen
--   → IF EXISTS hier nicht relevant (sind schon revoked, REVOKE ist idempotent)
--
-- 1 Tabelle ist bereits via AAR-851 (#1071) SELECT-revoked für anon:
--   claim_payments (nur SELECT, INSERT/UPDATE/DELETE-grants bestanden weiter)
--   → wir revoken auch die restlichen Privs

REVOKE ALL ON public.abrechnungen FROM anon;
REVOKE ALL ON public.abrechnung_positionen FROM anon;
REVOKE ALL ON public.abrechnung_reminders FROM anon;
REVOKE ALL ON public.claim_payments FROM anon;
REVOKE ALL ON public.finance_eintraege FROM anon;
REVOKE ALL ON public.finance_monatsberichte FROM anon;
REVOKE ALL ON public.gutachter_abrechnungen FROM anon;
REVOKE ALL ON public.gutachter_abrechnungspositionen FROM anon;
REVOKE ALL ON public.gutachter_monatsabrechnungen FROM anon;
REVOKE ALL ON public.incentive_auszahlungen FROM anon;
REVOKE ALL ON public.incentives FROM anon;
REVOKE ALL ON public.kanzlei_abrechnungen FROM anon;
REVOKE ALL ON public.kanzlei_abrechnung_positionen FROM anon;
REVOKE ALL ON public.kanzlei_abrechnung_reminders FROM anon;
REVOKE ALL ON public.makler_provisionen FROM anon;
REVOKE ALL ON public.provisionen_maik FROM anon;
REVOKE ALL ON public.rechnungs_konfiguration FROM anon;
REVOKE ALL ON public.rechnungs_nr_counter FROM anon;
REVOKE ALL ON public.sv_onboarding_rechnungen FROM anon;
REVOKE ALL ON public.sv_payment_reminders FROM anon;
