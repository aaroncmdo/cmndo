-- T3-slice-3e: reloptions-Restore nach den Slice-3-View-Replaces.
-- LESSON: CREATE OR REPLACE VIEW resettet reloptions (empirisch 16.07.) — anders als angenommen.
-- v_claim_for_gast MUSS security_invoker=true (Security-Fix 20260603 revoke_anon_rls_bypass:
-- Gast-View darf claims nur mit den Rechten/RLS des Callers lesen; der in-View auth.uid()-Gate
-- allein ersetzt die Caller-RLS nicht). sv/timeline waren explizit =false (== Default, definer-
-- Verhalten gewollt fuer die internen/definer-Views) — explizit zurueckgesetzt fuer Parity.
ALTER VIEW public.v_claim_for_gast SET (security_invoker = true);
ALTER VIEW public.v_claim_sv SET (security_invoker = false);
ALTER VIEW public.v_claim_timeline_ungated_internal SET (security_invoker = false);
