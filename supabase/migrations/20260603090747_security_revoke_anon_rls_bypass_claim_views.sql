-- SECURITY (anon PII leak): 9 claim/faelle-Views laufen mit security_invoker=false/null
-- (= als Owner postgres -> RLS-Bypass) und anon hatte GRANT ALL. Damit konnte der
-- oeffentliche anon-Key ALLE Claims/Faelle lesen (v_claim_full.parties = Namen/Adressen/
-- Geburtsdatum/Kontakt aller Parteien; v_gutachten_werte; faelle_*_view; etc.) und bei
-- updatable Views theoretisch schreiben.
--
-- Kein legitimer anon-Code-Read-Pfad: flow/[token] + upload/[token] nutzen service-role;
-- der gast/anon-Pfad laeuft ueber v_claim_for_gast / v_claim_parties_safe (security_invoker=true
-- + auth.uid()-Filter), die NUR Basistabellen (claims/claim_parties unter RLS) referenzieren ->
-- von diesem REVOKE NICHT betroffen.
--
-- Fix: REVOKE ALL FROM anon auf die 9 RLS-bypassenden Views. authenticated/service_role bleiben
-- unveraendert.
--
-- Follow-up (separat, braucht per-Rolle-RLS-Smoke): security_invoker=true setzen, damit auch
-- authenticated RLS-gescoped liest (aktuell kann jeder Eingeloggte via .eq('id', <claimId>) jeden
-- Claim lesen, weil die Views als Owner laufen). Nicht blind in Prod flippen.
--
-- Idempotent (REVOKE eines nicht vorhandenen Grants = no-op) -> replay-safe.

REVOKE ALL ON public.v_claim_full FROM anon;
REVOKE ALL ON public.v_claim_listing FROM anon;
REVOKE ALL ON public.v_claim_sv FROM anon;
REVOKE ALL ON public.v_claim_timeline FROM anon;
REVOKE ALL ON public.v_claim_phase FROM anon;
REVOKE ALL ON public.faelle_kunde_view FROM anon;
REVOKE ALL ON public.faelle_sv_view FROM anon;
REVOKE ALL ON public.v_faelle_mit_aktuellem_termin FROM anon;
REVOKE ALL ON public.v_gutachten_werte FROM anon;
