-- AAR-709 — 6 Tabellen mit RLS=ON aber 0 Policies härten
--
-- Status quo: RLS=ON ohne Policies wirkt aktuell wie ein impliziter Deny-All für
-- non-service_role. Funktioniert solange alle Caller via createAdminClient() laufen,
-- aber: latente Falle, wenn jemand versehentlich createClient() (Auth) nutzt → silent
-- dead-end mit leerem Result-Set. Reviewer können das nicht sehen, weil "RLS ist ja aktiv".
--
-- Code-Trace bestätigt: alle Aufrufer aktuell admin/service_role:
--   kunde_gutachten_requests     → src/app/api/kunde/gutachten/magic/[token]/route.ts (admin)
--                                  + src/app/api/kunde/gutachten/weiterleiten/route.ts (admin)
--   rechnungs_konfiguration      → src/lib/billing/get-rechnungs-konfig.ts (admin)
--   rechnungs_nr_counter         → kein direkter Aufruf (intern via Function/Trigger)
--   sv_onboarding_rechnungen     → src/lib/billing/create-onboarding-rechnung.ts (admin)
--   task_reminders               → src/lib/tasks/reminder-{sender,generator}.ts (admin)
--                                  + src/lib/resolver/eskalation-cron.ts (admin)
--                                  + src/app/api/cron/task-erinnerungen/route.ts
--   whatsapp_inbound_messages    → src/app/api/webhooks/twilio/inbound/route.ts (admin)
--
-- Fix: explizite "service_only"-Policy + REVOKE der GRANTS an anon/authenticated/public.
-- Damit ist im Code-Review unmittelbar erkennbar, dass die Tabelle service_role-only ist.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Explizite Service-Role-Only Policies (6×)
-- ─────────────────────────────────────────────────────────────────────

CREATE POLICY "kunde_gutachten_requests_service_only"
  ON public.kunde_gutachten_requests
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "rechnungs_konfiguration_service_only"
  ON public.rechnungs_konfiguration
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "rechnungs_nr_counter_service_only"
  ON public.rechnungs_nr_counter
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "sv_onboarding_rechnungen_service_only"
  ON public.sv_onboarding_rechnungen
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "task_reminders_service_only"
  ON public.task_reminders
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "whatsapp_inbound_messages_service_only"
  ON public.whatsapp_inbound_messages
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- 2. REVOKE der GRANTS an anon/authenticated/public — Schema kommuniziert
--    explizit "Tabelle ist service-only"
-- ─────────────────────────────────────────────────────────────────────

REVOKE ALL ON public.kunde_gutachten_requests   FROM anon, authenticated, public;
REVOKE ALL ON public.rechnungs_konfiguration    FROM anon, authenticated, public;
REVOKE ALL ON public.rechnungs_nr_counter       FROM anon, authenticated, public;
REVOKE ALL ON public.sv_onboarding_rechnungen   FROM anon, authenticated, public;
REVOKE ALL ON public.task_reminders             FROM anon, authenticated, public;
REVOKE ALL ON public.whatsapp_inbound_messages  FROM anon, authenticated, public;

COMMENT ON TABLE public.kunde_gutachten_requests  IS 'Service-Role-only (AAR-709). Kein direkter Anon/Authenticated-Zugriff.';
COMMENT ON TABLE public.rechnungs_konfiguration   IS 'Service-Role-only (AAR-709). Kein direkter Anon/Authenticated-Zugriff.';
COMMENT ON TABLE public.rechnungs_nr_counter      IS 'Service-Role-only (AAR-709). Kein direkter Anon/Authenticated-Zugriff.';
COMMENT ON TABLE public.sv_onboarding_rechnungen  IS 'Service-Role-only (AAR-709). Kein direkter Anon/Authenticated-Zugriff.';
COMMENT ON TABLE public.task_reminders            IS 'Service-Role-only (AAR-709). Kein direkter Anon/Authenticated-Zugriff.';
COMMENT ON TABLE public.whatsapp_inbound_messages IS 'Service-Role-only (AAR-709). Kein direkter Anon/Authenticated-Zugriff.';
