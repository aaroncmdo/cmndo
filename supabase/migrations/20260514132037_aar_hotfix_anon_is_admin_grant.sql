-- HOTFIX 2026-05-14: GRANT EXECUTE is_admin() TO anon — Marketing-Karte unbreaken
--
-- Befund: /gutachter-finden Marketing-Karte zeigt seit Migration
-- 20260514101645_aar_fn_revoke_execute_security_definer "0 Sachverständige
-- bundesweit verfügbar" auf claimondo.de + app.claimondo.de.
--
-- Root Cause:
--   * Die 101645er-Migration revoked EXECUTE auf is_admin() FROM PUBLIC, anon,
--     authenticated. Die Migration begründet das damit dass RLS-Policy-
--     Evaluierung mit Owner-Privilegien laufe — das ist FALSCH. Postgres
--     prüft EXECUTE-Permissions des CALLERS auch wenn eine Function als
--     SECURITY DEFINER markiert ist; nur der Function-BODY läuft als Owner.
--   * Folge-Migrationen (20260514102431, 20260514115529) haben is_admin()
--     an `authenticated` zurückgegrantet, aber `anon` vergessen.
--   * sv_leads.sv_leads_admin_all + sachverstaendige."Admins full access"
--     sind beide PUBLIC-Policies die is_admin() aufrufen. Anon-Read evaluiert
--     diese Policies → permission denied → 42501 → ganze Query schlägt fehl.
--
-- Reproduktion (vor Apply):
--   set role anon;
--   select count(*) from sv_leads where ist_aktiv = true;
--   → ERROR: permission denied for function is_admin
--
-- Erwartung nach Apply:
--   set role anon;
--   select count(*) from sv_leads where ist_aktiv = true;
--   → 62
--   select count(*) from sachverstaendige
--     where verifiziert and ist_aktiv and isochrone_polygon is not null;
--   → 7
--
-- Sicherheits-Hinweis:
--   is_admin() ist eine SECURITY DEFINER Function die für anon-User immer
--   false zurückgibt (kein auth.uid() → kein Profile → kein Admin). Anon
--   EXECUTE-Grant ist also informationstheoretisch leak-frei — die Function
--   kann nichts preisgeben was anon nicht ohnehin weiß. Die 101645er-
--   Migration hatte den Pfad "Information-Disclosure via /rpc/is_admin"
--   im Sinn, aber das ist über is_admin() nicht ausnutzbar (output ist
--   konstant false für anon).
--
-- Ausstehend (separate Tickets/PRs):
--   * Defense-in-depth: ALTER POLICY der admin-only Policies auf TO authenticated
--     einschränken — Anon evaluiert sie dann gar nicht erst. Saubere Lösung,
--     ~25 Policy-ALTERs, kommt im AAR-Folge-Ticket.
--   * Audit: noch weitere anon-Read-Pfade prüfen (Public-API-Endpoints?)
--     die admin-Funktionen via PUBLIC-Policies indirekt aufrufen.

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

-- Verifikation post-apply:
DO $$
DECLARE
  has_grant boolean;
BEGIN
  SELECT has_function_privilege('anon', 'public.is_admin()', 'EXECUTE') INTO has_grant;
  IF NOT has_grant THEN
    RAISE EXCEPTION 'Hotfix nicht wirksam: anon hat weiter kein EXECUTE auf is_admin()';
  END IF;
  RAISE NOTICE 'Hotfix verifiziert: anon kann is_admin() jetzt ausfuehren';
END $$;
