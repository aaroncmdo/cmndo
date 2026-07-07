-- 2026-07-07 HOTFIX (shared build-blocker): v_claim_payments Row-Gate ergaenzen.
--
-- check-claim-view-rls.mjs (required build-step, laeuft empirisch gg PROD) war fuer
-- JEDEN PR aller Sessions ROT: audit_claim_views_leaking_to_nobody() sah v_claim_payments
-- 1 Zeile fuer einen Nobody-User. Ursache: die (neue) View war security_invoker=true,
-- aber OHNE internen Row-Gate `claim_sichtbar_fuer_aktuellen_user(claim_id)`, den alle
-- anderen Claim-Read-Views tragen muessen (Team-Standard, Spec 2026-06-27-rls-haertung-
-- claim-views-design.md). Der Guard-RPC laeuft empirisch -> jeder PR-Build blockiert.
--
-- Fix: Row-Gate ergaenzen. View-Def byte-identisch zum Bestand (pg_get_viewdef), NUR
-- das WHERE ist neu; security_invoker=true beibehalten. 0 deployte Consumer (Grep in
-- staging src) -> keine Breakage. Angewandt via apply_migration (Regel 2), Version ==
-- Dateiname == 20260707142841. Verifiziert: has_gate=true, leaking_views=[] (RPC gruen).
--
-- ⚠ Owner-Koordination: v_claim_payments gehoert der payment-ledger-Session (vclaimbase).
--   Ihre kuenftige View-Def MUSS diesen Gate behalten (sonst faellt der Guard erneut).
--   Siehe BROADCAST-vclaimpayments-rls-build-blocker.
CREATE OR REPLACE VIEW public.v_claim_payments
WITH (security_invoker = true) AS
 SELECT claim_id,
    max(forderungsbetrag) FILTER (WHERE partei = 'vs'::text) AS vs_soll,
    max(erhaltener_betrag) FILTER (WHERE partei = 'vs'::text) AS vs_ist,
    max(zahlungseingang_am) FILTER (WHERE partei = 'vs'::text) AS vs_am,
    max(status) FILTER (WHERE partei = 'vs'::text) AS vs_status,
    max(zahlungsweg) FILTER (WHERE partei = 'vs'::text) AS vs_zahlungsweg,
    max(forderungsbetrag) FILTER (WHERE partei = 'kunde'::text) AS kunde_soll,
    max(erhaltener_betrag) FILTER (WHERE partei = 'kunde'::text) AS kunde_ist,
    max(zahlungseingang_am) FILTER (WHERE partei = 'kunde'::text) AS kunde_am,
    max(status) FILTER (WHERE partei = 'kunde'::text) AS kunde_status,
    max(forderungsbetrag) FILTER (WHERE partei = 'sv'::text) AS sv_soll,
    max(erhaltener_betrag) FILTER (WHERE partei = 'sv'::text) AS sv_ist,
    max(zahlungseingang_am) FILTER (WHERE partei = 'sv'::text) AS sv_am,
    max(status) FILTER (WHERE partei = 'sv'::text) AS sv_status
   FROM claim_payments
  WHERE claim_sichtbar_fuer_aktuellen_user(claim_id)
  GROUP BY claim_id;
