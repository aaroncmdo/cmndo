-- 2026-05-12: CRITICAL Privilege-Escalation-Fix — profiles.rolle gegen Selbst-Eskalation sperren
-- Siehe docs/12.05.2026/LIVE-SCHEMA-RLS-AUDIT-12.05.2026.md §1.
--
-- Problem: Das public-Schema hat den Supabase-Default `GRANT ALL ON ALL TABLES TO anon, authenticated`.
-- Zusammen mit der RLS-Policy "Profil bearbeiten" (USING ((id = auth.uid()) OR is_admin()), WITH CHECK
-- = NULL → defaultet auf USING) konnte jeder eingeloggte User via direktem
--   PATCH /rest/v1/profiles?id=eq.<eigene-uid>   {"rolle":"admin"}
-- seine Rolle auf 'admin' setzen (ein rolle-only-UPDATE ändert die id nicht → USING/WITH-CHECK passt;
-- is_admin() ist SECURITY DEFINER und liest profiles.rolle → sofort Admin). Komplett am App-Layer
-- vorbei. Ein column-level `REVOKE UPDATE (rolle)` wirkt NICHT, weil das table-level `GRANT UPDATE`
-- alle Spalten abdeckt — die saubere Lösung ist ein Trigger, der Rollen-Änderungen durch nicht-
-- privilegierte Caller blockt (robust gegen später hinzugefügte Spalten, deckt auch INSERT ab).
--
-- Erlaubte Rollen-Setzer: service_role (createAdminClient — SV-/Team-/Kunde-Anlage, Lead-Konversion,
-- Airdrop, Admin-Rollenänderungen), die Migrations-/Admin-Connection-Rollen (postgres/supabase_admin/
-- authenticator) und Admins (is_admin()). Alle anderen: rolle bleibt unverändert (UPDATE) bzw. wird
-- auf den 'kunde'-Default gezwungen (INSERT).

CREATE OR REPLACE FUNCTION public.guard_profiles_rolle()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (default): current_user = aufrufende Rolle (authenticated/anon/service_role/postgres)
AS $$
DECLARE
  privileged boolean := current_user IN ('service_role', 'supabase_admin', 'postgres', 'authenticator')
                        OR public.is_admin();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT privileged AND NEW.rolle IS DISTINCT FROM 'kunde'::public.user_role THEN
      NEW.rolle := 'kunde'::public.user_role;
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE
  IF NEW.rolle IS DISTINCT FROM OLD.rolle AND NOT privileged THEN
    RAISE EXCEPTION 'Rollen-Änderung nur durch Admins oder service_role erlaubt (versucht: % → %)', OLD.rolle, NEW.rolle
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profiles_rolle_upd ON public.profiles;
CREATE TRIGGER guard_profiles_rolle_upd
  BEFORE UPDATE OF rolle ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_rolle();

DROP TRIGGER IF EXISTS guard_profiles_rolle_ins ON public.profiles;
CREATE TRIGGER guard_profiles_rolle_ins
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_rolle();
