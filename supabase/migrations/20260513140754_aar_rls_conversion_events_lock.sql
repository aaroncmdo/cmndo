-- RLS-Hardening 13.05.2026 — conversion_events Lock.
--
-- Supabase-Advisor flaggte:
--   CRITICAL — RLS Disabled in Public
--     Table public.conversion_events is public, but RLS has not been enabled.
--   CRITICAL — Sensitive Columns Exposed (session_id)
--
-- Die Tabelle wird ausschließlich via lib/analytics/track-conversion.ts
-- (`createAdminClient` = service_role) beschrieben. Anon/authenticated
-- haben keinen legitimen Grund zum direkten REST-Zugriff.
--
-- Fix: RLS aktivieren + Default-deny. service_role bypassed RLS sowieso,
-- der Tracking-Pfad bleibt unverändert. Falls in Zukunft eine Admin-Read-
-- View nötig wird, kommt eine spezifische SELECT-Policy für `admin`-User
-- via public.is_admin().

-- 1. RLS aktivieren
ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;

-- 2. Keine Policies anlegen → Default-deny für jeden non-service_role-Client.

-- 3. Privilegien zusätzlich entziehen (Defense-in-Depth gegen versehentliche
--    Policy-Lockerung). PostgREST exponiert die Tabelle ohne SELECT-Grant
--    nicht mehr — Advisor sollte nach Apply grün werden.
REVOKE ALL ON public.conversion_events FROM anon, authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.conversion_events TO service_role;

COMMENT ON TABLE public.conversion_events IS
  '2026-05-12 Funnel v3 + 13.05.2026 RLS-Lock: Drop-off-Tracking, anonym, ohne PII. RLS=on/default-deny — Zugriff nur via service_role.';
