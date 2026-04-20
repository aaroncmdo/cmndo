-- AAR-613: Security-DDL Sprint
-- 1) v_faelle_mit_aktuellem_termin: SECURITY DEFINER → SECURITY INVOKER
-- 2) RLS aktivieren auf 5 Public-Tabellen die bisher ohne RLS in PostgREST
--    exponiert waren. Keine Policies — alle Tabellen werden code-seitig
--    ausschließlich via createAdminClient() (Service Role) benutzt, d.h.
--    RLS-Enable ohne Policies schließt den anon/authenticated-Zugriff
--    ohne App-Code zu brechen.
--
-- Evidenz:
-- - Supabase MCP get_advisors(security) meldet:
--   * ERROR security_definer_view: v_faelle_mit_aktuellem_termin
--   * ERROR rls_disabled_in_public × 5
-- - Code-Grep bestätigt: alle 5 Tabellen werden ausschließlich via
--   `createAdminClient()` verwendet (service_role bypasst RLS).

-- ============================================================
-- 1) View auf SECURITY INVOKER umstellen
-- ============================================================
ALTER VIEW public.v_faelle_mit_aktuellem_termin SET (security_invoker = true);

COMMENT ON VIEW public.v_faelle_mit_aktuellem_termin IS
  'Aktueller Termin je Fall (LATERAL-Join auf gutachter_termine). AAR-613: '
  'security_invoker=true — respektiert RLS des abfragenden Users statt des '
  'View-Creators.';

-- ============================================================
-- 2) RLS aktivieren auf 5 Tabellen
-- ============================================================
ALTER TABLE public.whatsapp_inbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sv_onboarding_rechnungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rechnungs_konfiguration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rechnungs_nr_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_reminders ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.whatsapp_inbound_messages IS
  'Twilio Inbound-Webhook-Staging. AAR-613: RLS enabled, keine Policies — '
  'nur service_role (createAdminClient) greift zu.';

COMMENT ON TABLE public.sv_onboarding_rechnungen IS
  'SV-Onboarding-Rechnungen. AAR-613: RLS enabled, nur service_role.';

COMMENT ON TABLE public.rechnungs_konfiguration IS
  'Rechnungs-Nummernkreis-Konfiguration. AAR-613: RLS enabled, nur service_role.';

COMMENT ON TABLE public.rechnungs_nr_counter IS
  'Monotoner Zähler für Rechnungs-Nummern. AAR-613: RLS enabled, nur service_role.';

COMMENT ON TABLE public.task_reminders IS
  'Task-Erinnerungs-Queue (Cron-verarbeitet). AAR-613: RLS enabled, nur service_role.';
