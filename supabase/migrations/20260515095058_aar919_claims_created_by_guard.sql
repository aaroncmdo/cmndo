-- AAR-919 (Audit A5): claims.created_by_user_id Guard-Trigger
--
-- Hintergrund: RLS-Policy claims_staff_all_consolidated ist FOR ALL mit
-- qual = (is_admin() OR (is_kundenbetreuer() AND (kundenbetreuer_id=auth.uid()
-- OR kundenbetreuer_id IS NULL))). Es gibt kein with_check — heißt ein
-- Kundenbetreuer kann INSERT mit beliebiger created_by_user_id machen
-- (z.B. fremde Admin-UUID als Created-By eintragen → Audit-Spoofing).
--
-- Latent weil aktueller Caller-Pfad via createAdminClient (service_role) läuft,
-- aber RLS-Layer ist nicht dicht. Trigger analog AAR-913 guard_*_privilegien:
--
--   - Bei INSERT durch nicht-privilegierten User: NEW.created_by_user_id auf
--     auth.uid() zwingen (Default-Verhalten, Audit-Trail dicht)
--   - Bei UPDATE durch nicht-privilegierten User mit fremder UUID:
--     RAISE EXCEPTION mit insufficient_privilege
--   - Privilegierte User (service_role, admin) passieren unverändert

CREATE OR REPLACE FUNCTION public.guard_claims_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  privileged boolean := current_user IN ('service_role', 'supabase_admin', 'postgres', 'authenticator')
                        OR public.is_admin();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT privileged THEN
      -- Kundenbetreuer-Insert: created_by auf eigene auth.uid() zwingen
      NEW.created_by_user_id := (SELECT auth.uid());
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NOT privileged AND NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'Nur Admins/service_role dürfen claims.created_by_user_id ändern (versucht an claims.%)', NEW.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_claims_created_by_ins ON public.claims;
CREATE TRIGGER guard_claims_created_by_ins
  BEFORE INSERT ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.guard_claims_created_by();

DROP TRIGGER IF EXISTS guard_claims_created_by_upd ON public.claims;
CREATE TRIGGER guard_claims_created_by_upd
  BEFORE UPDATE OF created_by_user_id ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.guard_claims_created_by();

COMMENT ON FUNCTION public.guard_claims_created_by() IS
  'AAR-919 — Audit-Spoofing-Lock: created_by_user_id darf nur von Admins/service_role auf fremde UUID gesetzt werden. KB-INSERT defaultet auf auth.uid().';
