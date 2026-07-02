-- Golden-Path E2E-Harness (Spec 2026-07-02, §4b Rollen-Abdeckung): JWT-Sim-Helper.
-- Prueft, ob ein bestimmter User (p_user_id) einen Claim unter RLS SEHEN wuerde — via
-- das etablierte Muster aus dem RLS-Safety-Net #3334 (audit_claim_view_identity):
-- request.jwt.claims lokal setzen (auth.uid()-Quelle) + das bestehende Gate
-- claim_sichtbar_fuer_aktuellen_user auswerten. Nur fuer den Harness (service-role);
-- EXECUTE fuer public/anon/authenticated revoked.
-- Angewendet via apply_migration am 2026-07-02 (getrackte Version 20260702100933).
-- DB-Smoke verifiziert: Eigentuemer -> true, fremder User -> false.

CREATE OR REPLACE FUNCTION public.golden_path_claim_visible_for(p_claim_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  RETURN public.claim_sichtbar_fuer_aktuellen_user(p_claim_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.golden_path_claim_visible_for(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.golden_path_claim_visible_for(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.golden_path_claim_visible_for(uuid, uuid) FROM authenticated;
