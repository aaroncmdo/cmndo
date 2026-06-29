-- Verworfen: der SET-ROLE-Ansatz fuer Tabellen-RLS-Tests funktioniert NICHT
-- ("cannot set parameter role within security-definer function"). Tabellen-RLS kann — anders
-- als die View-Gates (WHERE im View) — nur ueber einen ECHTEN authenticated-Client getestet
-- werden, weil postgres/service_role RLS bypassen. Tabellen-Check = scripts/check-claim-table-rls.mjs
-- (supabase-js + Nobody-User).
DROP FUNCTION IF EXISTS public.audit_claim_tables_leaking_to_nobody();
