-- AAR-888 — RLS-Phase-1 #5: Wide-open anon RLS-Policies härten
--
-- Kontext: Supabase-Advisor `rls_policy_always_true` zeigt 8 Policies mit `WITH CHECK (true)`.
-- Code-Trace (Issue AAR-888): 0 aktive Caller hängen an den 5 anon-Policies — der gesamte
-- Magic-Link-Flow + Upload-Flow läuft via `createAdminClient()` (service_role, RLS-bypass).
-- `benachrichtigungen.System insert` ebenfalls ohne legitimen authenticated-Caller (alle
-- 6 produktiven Inserts via service_role; ein toter Client-Insert in gutachter/gebiet/page.tsx
-- mit nicht-existenten Feldern wird im selben PR entfernt).
-- `profiles.Profil erstellen` wird auf `id = auth.uid()` für authenticated eingeengt.
--
-- ROLLBACK (Original-Definitionen für Notfall-Restore):
--   CREATE POLICY "Anon sign faelle" ON public.faelle
--     FOR UPDATE TO anon
--     USING ((abtretung_signiert_am IS NULL) AND (vollmacht_signiert_am IS NULL))
--     WITH CHECK (true);
--   CREATE POLICY "Flow anon insert faelle" ON public.faelle
--     FOR INSERT TO anon WITH CHECK (true);
--   CREATE POLICY "Flow anon insert leads" ON public.leads
--     FOR INSERT TO anon WITH CHECK (true);
--   CREATE POLICY "Flow anon update leads" ON public.leads
--     FOR UPDATE TO anon
--     USING (status = 'flow-gesendet'::lead_status)
--     WITH CHECK (true);
--   CREATE POLICY "Flow anon insert schadenspositionen" ON public.schadenspositionen
--     FOR INSERT TO anon WITH CHECK (true);
--   CREATE POLICY "Profil erstellen" ON public.profiles
--     FOR INSERT TO public WITH CHECK (true);
--   CREATE POLICY "System insert" ON public.benachrichtigungen
--     FOR INSERT TO authenticated WITH CHECK (true);
--
-- LASSEN: `gutachter_finder_anfragen.gfa_insert_public` (öffentliches Formular, beabsichtigt;
-- Rate-Limit als separates Folge-Ticket).

-- ───────────────────────────────────────────────────────────────────────────
-- DROP (6×): rein anon + benachrichtigungen-system, kein legitimer Caller
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anon sign faelle"                    ON public.faelle;
DROP POLICY IF EXISTS "Flow anon insert faelle"             ON public.faelle;
DROP POLICY IF EXISTS "Flow anon insert leads"              ON public.leads;
DROP POLICY IF EXISTS "Flow anon update leads"              ON public.leads;
DROP POLICY IF EXISTS "Flow anon insert schadenspositionen" ON public.schadenspositionen;
DROP POLICY IF EXISTS "System insert"                       ON public.benachrichtigungen;

-- ───────────────────────────────────────────────────────────────────────────
-- TIGHTEN (1×): profiles — nur eigener User, nur authenticated
-- Auth-Trigger läuft als `postgres` → RLS-bypass, unbetroffen.
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Profil erstellen" ON public.profiles;
CREATE POLICY "Profil erstellen" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
