-- Audit §7-A (A5/A8 partial): least-privilege. Both tables granted anon+authenticated
-- the full DML set (incl DELETE/UPDATE/TRUNCATE) which no code path uses.
-- consent_records: only INSERT (+SELECT, RLS-gated) is a real path -> drop destructive grants.
REVOKE DELETE, UPDATE, TRUNCATE ON public.consent_records FROM anon, authenticated;
-- content_translations: table comment says "Zugriff nur via service-role"; writes are
-- service-role only (empty table, portal-i18n not shipped) -> drop all write grants.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.content_translations FROM anon, authenticated;
