-- AAR-FN-REVOKE — REVOKE EXECUTE auf 16 SECURITY DEFINER Functions für anon + authenticated
--
-- Befund (Supabase-Advisors `anon_security_definer_function_executable` +
-- `authenticated_security_definer_function_executable`): 16 Functions sind
-- als SECURITY DEFINER markiert und via /rest/v1/rpc/... von anon UND
-- authenticated direkt aufrufbar. Das ist Information-Disclosure:
-- Angreifer kann z.B. /rpc/is_admin mit beliebiger Session callen und
-- bekommt eine boolean-Antwort über die eigene Rolle.
--
-- Wichtig: die `is_*`-Helper werden in RLS-Policies referenziert. RLS-
-- Policy-Evaluierung läuft mit den Permissions der Function-Definition
-- (SECURITY DEFINER → postgres role), NICHT mit Caller-Permissions.
-- REVOKE EXECUTE bricht also KEINE RLS-Policy-Evaluierung, nur direkte
-- /rpc/-Aufrufe vom Client.
--
-- Code-Trace 2026-05-14:
--   * 14 Functions: 0 .rpc()-Aufrufe im App-Code → REVOKE risikofrei
--   * get_sichtbare_qualifikationen + is_dat_badge_sichtbar:
--     Wrapper-Functions in src/lib/sv/qualifikationen-gate.ts existieren,
--     aber 0 Caller im Repo (AAR-515 Welle 5 nicht aktiv) → toter Code
--     → REVOKE auch hier ok. Falls AAR-515 reaktiviert wird, muss der
--     Caller entweder über service_role gehen (createAdminClient) ODER
--     die Function umgebaut werden auf STABLE/INVOKER mit eigenem
--     Permission-Check.
--   * sync_fall_dokumente_claim_id: BEFORE-Trigger aus AAR-862,
--     ausschließlich vom Trigger-Mechanismus aufgerufen, nie via /rpc/.
--   * upsert_vehicle_by_fin: kein .rpc()-Caller im Repo.
--
-- service_role behält EXECUTE (RLS-bypass-Pfade nutzen es weiter, falls je
-- relevant).

REVOKE EXECUTE ON FUNCTION public.can_access_fall(uuid)                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatcher_owns_lead(uuid)                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_sichtbare_qualifikationen(uuid)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_sv_id()                                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_rolle()                                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin()                                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_claim_user_party(uuid)                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_dat_badge_sichtbar(uuid)                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_dispatcher()                                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_kanzlei()                                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_kundenbetreuer()                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_staff()                                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_sv()                                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_sv_for_claim(uuid)                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_fall_dokumente_claim_id()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_vehicle_by_fin(
  character varying, character varying, character varying, character varying,
  text, text, uuid, text, integer
)                                                                                    FROM PUBLIC, anon, authenticated;
