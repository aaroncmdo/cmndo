-- AAR-895 — 3 Tabellen mit RLS=ON aber 0 Policies härten
--
-- Advisors (rls_enabled_no_policy): conversion_events, flow_links, lead_historie.
-- Funktioniert aktuell weil alle Caller via createAdminClient() laufen — aber
-- latente Falle wenn jemand versehentlich createClient() nutzt: silent dead-end
-- mit leerem Result-Set, Reviewer können das nicht erkennen weil "RLS ist ja aktiv".
--
-- Fix: explizite service_only-Policy + REVOKE der GRANTS (analog AAR-709).
-- Schema kommuniziert dann selbst, dass die Tabellen Service-Role-only sind.
--
-- Code-Trace 2026-05-14:
--   conversion_events    → src/lib/analytics/track-conversion.ts (admin)
--   flow_links           → 9 Files, alle admin: app/flow/[token]/*, dispatch/*,
--                          email/google/flows.ts, branding/token-theme.ts,
--                          actions/unterschrift-upload.ts etc.
--   lead_historie        → admin via dispatch-fall-actions
--
-- flow_links ist explizit Token-Gate für Magic-Link-Flow (AAR-888 dokumentiert).
-- Service-Only-Policy ändert die Semantik nicht — nur die Kommunikation.

CREATE POLICY "conversion_events_service_only"
  ON public.conversion_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "flow_links_service_only"
  ON public.flow_links
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "lead_historie_service_only"
  ON public.lead_historie
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.conversion_events FROM anon, authenticated, public;
REVOKE ALL ON public.flow_links        FROM anon, authenticated, public;
REVOKE ALL ON public.lead_historie     FROM anon, authenticated, public;

COMMENT ON TABLE public.conversion_events IS 'Service-Role-only (AAR-895). Marketing-Conversion-Tracking, Caller: lib/analytics/track-conversion.ts.';
COMMENT ON TABLE public.flow_links        IS 'Service-Role-only (AAR-895). Magic-Link-Token-Gate für /flow/[token]-Flow, Token-Resolution ausschließlich server-side via createAdminClient.';
COMMENT ON TABLE public.lead_historie     IS 'Service-Role-only (AAR-895). Lead-Audit-Trail aus Dispatch-Actions, kein User-facing Lese-Pfad.';
