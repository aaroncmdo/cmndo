-- CMM-49 PC-4 Security-Hotfix: die neue 2-arg delete_fall_komplett bekam via Supabase-
-- Default-Privileges EXPLIZITE EXECUTE-Grants an anon + authenticated. REVOKE FROM PUBLIC
-- entfernt die nicht. Eine SECURITY-DEFINER-Destruktiv-Funktion (loescht jeden Fall +
-- Claim, RLS-bypass) DARF nur via service_role (admin-Client) laufen — wie das 1-arg-
-- Pendant (#953/aar_secdef_revoke_public). Explizit revoken.
REVOKE EXECUTE ON FUNCTION public.delete_fall_komplett(uuid, uuid) FROM anon, authenticated, PUBLIC;
