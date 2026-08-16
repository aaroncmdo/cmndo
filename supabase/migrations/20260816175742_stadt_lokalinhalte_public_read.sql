-- Oeffentlicher Lesezugriff auf FREIGEGEBENE Stadt-Lokalinhalte.
--
-- Die Tabelle hatte RLS an, aber KEINE Policy -> nur service_role las etwas.
-- Damit war die gesamte P2-Pipeline (Gate, Generator, Admin) unsichtbar: es gab
-- nichts, was die Inhalte auf der Marketing-Seite haette anzeigen koennen.
--
-- WARUM anon-Policy statt service_role im Marketing-Read: Der ganze Zweck dieser
-- Tabelle ist "kein Auto-Publish, redaktionelle Freigabe ist Pflicht". Ein
-- service_role-Read koennte Entwuerfe sehen, sobald jemand den Statusfilter
-- vergisst. Die Policy macht das strukturell unmoeglich. Exakt dasselbe Muster
-- wie wissen_artikel_public_read.
--
-- Grant BEWUSST spaltenweise: reviewed_von (User-UUID), reviewed_am, ai_model,
-- substanz_score und die internen Zeitstempel gehen anon nichts an. ai_generated
-- ist dabei, weil die Seite generierte Inhalte als solche kennzeichnen koennen
-- muss (UWG-Transparenz). Neue public-Tabellen granten anon per Default nichts
-- (#4555) — deshalb der explizite Grant.

grant select (
  stadt_slug,
  status,
  stadtbezirke,
  hauptachsen,
  unfall_hotspots,
  lokale_faqs,
  hero_anker,
  topografie_anker,
  veroeffentlicht_am,
  ai_generated
) on public.stadt_lokalinhalte to anon;

create policy stadt_lokalinhalte_public_read
  on public.stadt_lokalinhalte
  for select
  to anon, authenticated
  using (status = 'veroeffentlicht');
