-- AAR-913: Mass-Assignment-Hardening für profiles / sachverstaendige / makler
--
-- Schwester-Migration zu AAR-893 (profiles.rolle-Trigger), AAR-893-Erweiterung
-- (sachverstaendige.verifiziert/werbebudget/ist_aktiv/use_custom_branding +
-- makler.status/provision_*).
--
-- Verbleibende Lücken (15.05.2026):
--
-- profiles:
--   - sv_paket: SV könnte sich Premium-Paket geben → Geld-Verlust
--   - aktiv: User könnte sich gegen Admin-Deaktivierung reaktivieren
--
-- sachverstaendige:
--   - paket, paket_faelle_gesamt, paket_preis, paket_umkreis_km: Paket-Manipulation
--   - gesperrt_grund, gesperrt_seit: Sperr-Audit überschreiben (Bypass)
--   - verifizierung_status: Verifizierungs-State spoofen
--
-- makler:
--   - user_id: KRITISCH — könnte fremden Makler-Account übernehmen, weil
--     UPDATE-Policy "user_id = auth.uid()" greift NACHHER mit alter user_id,
--     aber Trigger sieht WITH CHECK = NEW. Schutz via Trigger nötig.
--
-- Mass-Assignment-Policy-Fixes (separate Block am Ende):
--   - gutachter_monatsabrechnungen: SV-Policy ALL → SELECT (SV darf eigene
--     Monatsabrechnung lesen, aber nicht ändern/löschen)
--   - gutachter_abrechnungspositionen: gleiches Muster

-- ============================================================
-- 1. profiles — Trigger erweitern um sv_paket + aktiv
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_profiles_rolle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  privileged boolean := current_user IN ('service_role', 'supabase_admin', 'postgres', 'authenticator')
                        OR public.is_admin();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT privileged AND NEW.rolle IS DISTINCT FROM 'kunde'::public.user_role THEN
      NEW.rolle := 'kunde'::public.user_role;
    END IF;
    -- Neue Selbst-Anlegen-Defaults: Premium-Paket + aktiv-Flag dürfen nicht via INSERT gesetzt werden
    IF NOT privileged THEN
      NEW.sv_paket := NULL;
      NEW.aktiv := true;  -- Default aus Schema, aber explizit setzen für Klarheit
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE
  IF NOT privileged AND (
       NEW.rolle IS DISTINCT FROM OLD.rolle
    OR NEW.sv_paket IS DISTINCT FROM OLD.sv_paket
    OR NEW.aktiv IS DISTINCT FROM OLD.aktiv
  ) THEN
    RAISE EXCEPTION 'Nur Admins/service_role dürfen rolle/sv_paket/aktiv ändern (versucht an profiles.%)', NEW.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_profiles_rolle_upd ON public.profiles;
CREATE TRIGGER guard_profiles_rolle_upd
  BEFORE UPDATE OF rolle, sv_paket, aktiv ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_rolle();

-- ============================================================
-- 2. sachverstaendige — Trigger erweitern um paket-Felder + gesperrt + verifizierung_status
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_sachverstaendige_privilegien()
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
      NEW.verifiziert := false;
      NEW.werbebudget_guthaben_netto := 0;
      NEW.ist_aktiv := false;
      NEW.use_custom_branding := false;
      -- Paket-Defaults: keine Selbst-Bedienung
      NEW.paket := NULL;
      NEW.paket_faelle_gesamt := 0;
      NEW.paket_preis := 0;
      NEW.paket_umkreis_km := 0;
      -- Sperr-Status + Verifizierung kommt nur via Admin-Pfad
      NEW.gesperrt_grund := NULL;
      NEW.gesperrt_seit := NULL;
      NEW.verifizierung_status := 'pending';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NOT privileged AND (
       NEW.verifiziert IS DISTINCT FROM OLD.verifiziert
    OR NEW.werbebudget_guthaben_netto IS DISTINCT FROM OLD.werbebudget_guthaben_netto
    OR NEW.ist_aktiv IS DISTINCT FROM OLD.ist_aktiv
    OR NEW.use_custom_branding IS DISTINCT FROM OLD.use_custom_branding
    OR NEW.paket IS DISTINCT FROM OLD.paket
    OR NEW.paket_faelle_gesamt IS DISTINCT FROM OLD.paket_faelle_gesamt
    OR NEW.paket_preis IS DISTINCT FROM OLD.paket_preis
    OR NEW.paket_umkreis_km IS DISTINCT FROM OLD.paket_umkreis_km
    OR NEW.gesperrt_grund IS DISTINCT FROM OLD.gesperrt_grund
    OR NEW.gesperrt_seit IS DISTINCT FROM OLD.gesperrt_seit
    OR NEW.verifizierung_status IS DISTINCT FROM OLD.verifizierung_status
  ) THEN
    RAISE EXCEPTION 'Nur Admins/service_role dürfen Verifizierungs-/Paket-/Sperr-Felder ändern (versucht an sachverstaendige.%)', NEW.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_sachverstaendige_privilegien_upd ON public.sachverstaendige;
CREATE TRIGGER guard_sachverstaendige_privilegien_upd
  BEFORE UPDATE OF
    verifiziert, werbebudget_guthaben_netto, ist_aktiv, use_custom_branding,
    paket, paket_faelle_gesamt, paket_preis, paket_umkreis_km,
    gesperrt_grund, gesperrt_seit, verifizierung_status
  ON public.sachverstaendige
  FOR EACH ROW EXECUTE FUNCTION public.guard_sachverstaendige_privilegien();

-- ============================================================
-- 3. makler — Trigger erweitern um user_id (Account-Übernahme)
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_makler_privilegien()
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
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
  ) THEN
    RAISE EXCEPTION 'Nur Admins/service_role dürfen Provisions-/Status-/user_id-Felder ändern (versucht an makler.%)', NEW.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_makler_privilegien_upd ON public.makler;
CREATE TRIGGER guard_makler_privilegien_upd
  BEFORE UPDATE OF
    status, provision_betrag_komplett_netto, provision_betrag_nur_gutachter_netto,
    provision_aktiv, user_id
  ON public.makler
  FOR EACH ROW EXECUTE FUNCTION public.guard_makler_privilegien();

-- ============================================================
-- 4. gutachter_monatsabrechnungen — SV-Policy ALL → SELECT
-- ============================================================

-- Altpolicy droppen + zweistufig ersetzen (admin ALL bleibt, SV nur SELECT)
DROP POLICY IF EXISTS "SV eigene Abrechnungen" ON public.gutachter_monatsabrechnungen;

CREATE POLICY "Admin volle Abrechnungen"
ON public.gutachter_monatsabrechnungen
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.rolle = 'admin'::user_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.rolle = 'admin'::user_role
  )
);

CREATE POLICY "SV eigene Abrechnungen lesen"
ON public.gutachter_monatsabrechnungen
FOR SELECT
TO public
USING (
  sv_id IN (
    SELECT s.id FROM public.sachverstaendige s
    WHERE s.profile_id = (SELECT auth.uid())
  )
);

-- ============================================================
-- 5. gutachter_abrechnungspositionen — gleiches Pattern
-- ============================================================

DROP POLICY IF EXISTS "SV eigene Positionen" ON public.gutachter_abrechnungspositionen;

CREATE POLICY "Admin volle Positionen"
ON public.gutachter_abrechnungspositionen
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.rolle = 'admin'::user_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.rolle = 'admin'::user_role
  )
);

CREATE POLICY "SV eigene Positionen lesen"
ON public.gutachter_abrechnungspositionen
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.gutachter_monatsabrechnungen m
    WHERE m.id = gutachter_abrechnungspositionen.abrechnung_id
      AND m.sv_id IN (
        SELECT s.id FROM public.sachverstaendige s
        WHERE s.profile_id = (SELECT auth.uid())
      )
  )
);

-- ============================================================
-- 6. Comment-Tags für Audit-Trail
-- ============================================================

COMMENT ON FUNCTION public.guard_profiles_rolle() IS 'AAR-893/AAR-913 — Self-Update-Eskalation auf rolle/sv_paket/aktiv blocken';
COMMENT ON FUNCTION public.guard_sachverstaendige_privilegien() IS 'AAR-893/AAR-913 — Self-Update auf Verifizierungs-/Paket-/Sperr-Felder blocken';
COMMENT ON FUNCTION public.guard_makler_privilegien() IS 'AAR-893/AAR-913 — Self-Update auf Provisions-/Status-/user_id-Felder blocken';
