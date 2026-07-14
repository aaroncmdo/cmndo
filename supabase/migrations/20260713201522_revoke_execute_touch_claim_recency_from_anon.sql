-- S2 (Pre-Go-Live-Sweep, an a6c863e2 geroutet via COORDINATION-golive-sweep-master-routing):
-- touch_claim_recency(uuid) ist SECURITY DEFINER + anon-EXECUTE-bar (MCP-verifiziert:
-- has_function_privilege('anon', ..., 'EXECUTE')=true) -> anon koennte claim_recency
-- fuer beliebige Claims triggern. Defense-in-depth REVOKE (kein Re-GRANT an anon).
-- Function-Execute-Revoke (kein View) -> unabhaengig vom #4179 anon-View-Guard-Race.
revoke execute on function public.touch_claim_recency(uuid) from anon;
