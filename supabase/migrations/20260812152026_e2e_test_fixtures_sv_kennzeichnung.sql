-- E2E-Fixture-Kennzeichnung fuer Sachverstaendige (12.08.).
--
-- PROBLEM: Der Finder-BUCHUNGS-Pfad war auf prod nicht end-to-end smokebar. Der
-- Buchungs-Chokepoint reserviere() faehrt den Test-SV-Guard (Vorfall 03.07.: ein echter SV
-- bekam laufend Test-Termine). Dessen Matrix blockt (interner Lead, ECHTER SV) — und genau
-- diese Kombination ist im Finder-Test unvermeidbar:
--   * ein Test-SV (ist_testaccount=true) wird von applyDispatchableFilter aus dem Matching
--     gefiltert und taucht nie als Vorschlag auf;
--   * der Wegwerf-SV muss deshalb ist_testaccount=false sein -> Guard blockt jeden internen
--     Bucher;
--   * ein NICHT-interner Bucher wuerde die Send-Isolation aushebeln -> echte Kunden-Comms.
-- Folge: golden-path-finder-prod konnte seinen Submit-Zweig nie gruen fahren (#5216).
--
-- LOESUNG: eine EXPLIZITE Fixture-Kennzeichnung, die der Guard zusaetzlich zu ist_testaccount
-- als "Test" wertet — waehrend applyDispatchableFilter weiterhin nur ist_testaccount liest.
-- Damit wird der Wegwerf-SV gematcht UND ist fuer interne Identitaeten buchbar, ohne dass
-- die Schutzwirkung faellt: ein echter SV (nicht in dieser Tabelle) bleibt fuer interne
-- Buchungen gesperrt, und ein echter Kunde kann eine Fixture nicht buchen (echt->Test=BLOCK).
--
-- WARUM EIGENE TABELLE statt einer Spalte auf sachverstaendige:
-- `authenticated` hat dort einen TABLE-weiten Grant (relacl authenticated=arwdDxtm) — eine
-- neue Spalte wuerde SELECT *und* UPDATE erben und waere vom SV selbst setzbar. Ein
-- Sicherheits-Signal darf nicht im Schreibbereich dessen liegen, den es klassifiziert.
-- Hier greift die Default-Privileges-Wurzel (#4555): authenticated bekommt KEIN
-- INSERT/UPDATE/DELETE (verifiziert nach dem Apply — nur SELECT/REFERENCES/TRIGGER), das
-- Signal ist also nicht faelschbar. RLS ist zusaetzlich an und bleibt bewusst OHNE Policy
-- -> auch lesend erreichbar nur fuer service_role (BYPASSRLS), also fuer den Fixture-Seed.
--
-- WARUM NICHT ueber die SV-Email klassifizieren: geprueft am 12.08. — aktuell traefe es
-- keinen echten SV (die 2 Treffer mit interner Domain waren selbst Smoke-Leichen), aber
-- sobald Claimondo je einen eigenen Gutachter mit @claimondo.de betreibt, waere der still
-- als "Test" klassifiziert und fuer echte Kunden unbuchbar. Zeitbombe statt Loesung.

create table if not exists public.e2e_test_fixtures (
  sv_id uuid primary key references public.sachverstaendige(id) on delete cascade,
  angelegt_am timestamptz not null default now(),
  notiz text
);

alter table public.e2e_test_fixtures enable row level security;

comment on table public.e2e_test_fixtures is
  'E2E-Wegwerf-Fixtures: SVs, die der Test-SV-Guard als Test-SV wertet, obwohl sie fuer das Matching echt (ist_testaccount=false) sind. Nur service_role (RLS an, keine Policy). Eintrag verschwindet per ON DELETE CASCADE mit dem SV.';
