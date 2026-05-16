-- CMM-60 Phase 4 — SV-claims-Closure.
--
-- Schritt 2b hat v_claim_sv als spalten-gescopete SV-Projektion gebaut.
-- Phase 4 entzieht dem SV den direkten claims-Tabellen-Lesezugriff —
-- v_claim_sv wird sein einziges Claim-Lese-Fenster.
--
-- v_claim_sv muss dafuer von security_invoker auf security_definer: ein
-- security_invoker-View liefere nach der Closure 0 Zeilen, weil er an der
-- claims-RLS haengt, die wir gerade entziehen. Definer + Owner postgres ->
-- RLS-exempt, das View-eigene WHERE is_sv_for_claim ist der alleinige
-- Row-Filter.
--
-- Spec: docs/superpowers/specs/2026-05-16-cmm60-phase4-sv-claims-closure-design.md
-- NICHT in Scope: faelle-Drop + faelle->claims-Trigger-Drop = Phase 6.
-- is_sv_for_claim (Funktion) bleibt — claim_parties.cp_select_consolidated
-- nutzt sie weiter.

BEGIN;

-- 1. v_claim_sv selbsttragend machen (security_definer, RLS-exempt Owner).
ALTER VIEW public.v_claim_sv SET (security_invoker = false);
ALTER VIEW public.v_claim_sv OWNER TO postgres;

-- 2. is_sv_for_claim aus der claims-SELECT-Policy entfernen.
ALTER POLICY claims_kunde_sv_dispatch_select_consolidated ON public.claims
  USING (
    (is_dispatcher() AND dispatcher_owns_lead(lead_id))
    OR (geschaedigter_user_id = ( SELECT auth.uid() AS uid))
    OR is_claim_user_party(id)
  );

COMMIT;
