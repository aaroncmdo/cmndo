-- #4181 / Anon-Exposure-Guard (scripts/check-anon-exposure.mjs, Check B).
--
-- Problem: Auf einer FRISCH aus Files gebauten DB (Supabase-Preview) ist v_claim_workstate
-- anon-lesbar â€” Supabase' DEFAULT PRIVILEGES granten SELECT an anon fuer neue public-Views.
-- Zugleich ist die View eine DEFINER-View (security_invoker wurde NIE gesetzt â€” bewusst:
-- das Sichtbarkeits-Gate sitzt IN der View, siehe 20260707180610_v_claim_workstate_rls_gate).
-- Check B des Guards schlaegt genau auf diese Kombination an ("anon-lesbar UND
-- security_invoker=false -> RLS-Bypass-Risiko") => PR #4181 blockt sich selbst.
--
-- Fix = anon den Grant entziehen (die vom Guard selbst genannte Alternative).
-- BEWUSST NICHT security_invoker=true: die View gated bereits selbst via
-- claim_sichtbar_fuer_aktuellen_user(); zusaetzliche Basis-RLS wuerde DOPPELT filtern und
-- koennte das Mitarbeiter-Board (get-claim-workitems.ts) leerlaufen lassen.
--
-- Auf prod ist der Zielzustand bereits erfuellt (anon hat kein SELECT, authenticated schon) â€”
-- diese Migration macht ihn im File-Stream reproduzierbar und idempotent.
REVOKE ALL ON public.v_claim_workstate FROM anon;
GRANT SELECT ON public.v_claim_workstate TO authenticated;
