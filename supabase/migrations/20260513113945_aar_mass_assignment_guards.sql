-- RLS-Hardening Phase 1 — Sub-Plan #2: Mass-Assignment-Guards
-- für makler + sachverstaendige.
--
-- Spec: docs/superpowers/specs/2026-05-13-rls-hardening-phase-1-design.md §4
-- Audit: docs/12.05.2026/SECU/LIVE-SCHEMA-RLS-AUDIT-12.05.2026.md (HIGH #2)
-- Vorlage: 20260512140559_aar_profiles_rolle_lock.sql (PR #828)
--
-- Vorher: SV/Makler konnten via direktem PATCH auf eigene Row Privilegien
-- setzen (verifiziert=true, ist_aktiv=true, provision_aktiv=true, etc.) —
-- klassische Mass-Assignment-Lücke + Privilege-Escalation.
--
-- Spaltennamen verifiziert am 13.05.2026 gegen information_schema.columns
-- (Spec hatte `provision_betrag_cent` — real ist `provision_betrag_komplett_netto`
-- + `provision_betrag_nur_gutachter_netto`).
--
-- Geschützte Spalten:
--   makler: status, provision_betrag_komplett_netto,
--           provision_betrag_nur_gutachter_netto, provision_aktiv
--   sachverstaendige: verifiziert, werbebudget_guthaben_netto, ist_aktiv,
--                     use_custom_branding
--
-- Pattern: SECURITY INVOKER, current_user-Check für privileged Rollen +
-- public.is_admin(). Non-privileged Caller dürfen die Spalten weder bei INSERT
-- noch UPDATE setzen — INSERT erzwingt safe-Defaults, UPDATE wirft 42501.

-- ── makler ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_makler_privilegien()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  privileged boolean := current_user IN ('service_role', 'supabase_admin', 'postgres', 'authenticator')
                        OR public.is_admin();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT privileged THEN
      NEW.status := 'pending';
      NEW.provision_betrag_komplett_netto := 0;
      NEW.provision_betrag_nur_gutachter_netto := 0;
      NEW.provision_aktiv := false;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NOT privileged AND (
       NEW.status IS DISTINCT FROM OLD.status
    OR NEW.provision_betrag_komplett_netto IS DISTINCT FROM OLD.provision_betrag_komplett_netto
    OR NEW.provision_betrag_nur_gutachter_netto IS DISTINCT FROM OLD.provision_betrag_nur_gutachter_netto
    OR NEW.provision_aktiv IS DISTINCT FROM OLD.provision_aktiv
  ) THEN
    RAISE EXCEPTION 'Nur Admins dürfen Provisions-/Status-Felder ändern (versuchte Änderung an makler.%)', NEW.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_makler_privilegien_upd ON public.makler;
CREATE TRIGGER guard_makler_privilegien_upd
  BEFORE UPDATE OF status, provision_betrag_komplett_netto, provision_betrag_nur_gutachter_netto, provision_aktiv
  ON public.makler
  FOR EACH ROW EXECUTE FUNCTION public.guard_makler_privilegien();

DROP TRIGGER IF EXISTS guard_makler_privilegien_ins ON public.makler;
CREATE TRIGGER guard_makler_privilegien_ins
  BEFORE INSERT ON public.makler
  FOR EACH ROW EXECUTE FUNCTION public.guard_makler_privilegien();

-- ── sachverstaendige ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_sachverstaendige_privilegien()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  privileged boolean := current_user IN ('service_role', 'supabase_admin', 'postgres', 'authenticator')
                        OR public.is_admin();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT privileged THEN
      NEW.verifiziert := false;
      NEW.werbebudget_guthaben_netto := 0;
      NEW.ist_aktiv := false;
      NEW.use_custom_branding := false;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NOT privileged AND (
       NEW.verifiziert IS DISTINCT FROM OLD.verifiziert
    OR NEW.werbebudget_guthaben_netto IS DISTINCT FROM OLD.werbebudget_guthaben_netto
    OR NEW.ist_aktiv IS DISTINCT FROM OLD.ist_aktiv
    OR NEW.use_custom_branding IS DISTINCT FROM OLD.use_custom_branding
  ) THEN
    RAISE EXCEPTION 'Nur Admins dürfen Verifizierungs-/Werbebudget-/Aktiv-Felder ändern (versuchte Änderung an sachverstaendige.%)', NEW.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_sachverstaendige_privilegien_upd ON public.sachverstaendige;
CREATE TRIGGER guard_sachverstaendige_privilegien_upd
  BEFORE UPDATE OF verifiziert, werbebudget_guthaben_netto, ist_aktiv, use_custom_branding
  ON public.sachverstaendige
  FOR EACH ROW EXECUTE FUNCTION public.guard_sachverstaendige_privilegien();

DROP TRIGGER IF EXISTS guard_sachverstaendige_privilegien_ins ON public.sachverstaendige;
CREATE TRIGGER guard_sachverstaendige_privilegien_ins
  BEFORE INSERT ON public.sachverstaendige
  FOR EACH ROW EXECUTE FUNCTION public.guard_sachverstaendige_privilegien();

-- Rollback-Snippet (NICHT als Migration applied):
--
-- DROP TRIGGER IF EXISTS guard_makler_privilegien_upd ON public.makler;
-- DROP TRIGGER IF EXISTS guard_makler_privilegien_ins ON public.makler;
-- DROP FUNCTION IF EXISTS public.guard_makler_privilegien();
-- DROP TRIGGER IF EXISTS guard_sachverstaendige_privilegien_upd ON public.sachverstaendige;
-- DROP TRIGGER IF EXISTS guard_sachverstaendige_privilegien_ins ON public.sachverstaendige;
-- DROP FUNCTION IF EXISTS public.guard_sachverstaendige_privilegien();
