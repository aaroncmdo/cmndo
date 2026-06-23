-- Final-Review (Important): sv_lead_upsert ist SECURITY DEFINER und war via Default-PUBLIC-Grant
-- fuer anon + authenticated ausfuehrbar -> unauthentifizierter Schreibweg in sv_leads ueber die REST-RPC.
-- Der kanonische Pfad (src/lib/sv-leads/upsert.ts) nutzt ausschliesslich den service_role-Admin-Client.
-- Fix: EXECUTE von PUBLIC entziehen (anon/authenticated erbten es nur darueber), service_role explizit behalten.
--
-- HINWEIS: PUBLIC hielt KEIN Grant (proacl ohne PUBLIC-Eintrag) -> dieser REVOKE war ein No-op.
-- Die wirksame Korrektur erfolgt in 20260623180759_sv_lead_upsert_revoke_anon_auth.sql.
REVOKE EXECUTE ON FUNCTION public.sv_lead_upsert(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sv_lead_upsert(jsonb) TO service_role;
