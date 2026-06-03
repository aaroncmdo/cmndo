-- CMM-49 RLS Phase-6-Vorstufe: die 4 Direkt-faelle-Join-SELECT-Policies auf claim_id.
-- Äquivalenz auf Live-Daten bewiesen (alle lost/changed/servicetyp-delta = 0): kein Kunde/SV/
-- Kanzlei verliert oder gewinnt Zugriff. Staff-Legs + SV-via-sv_id-Leg verbatim erhalten.
-- Kunde-Leg: faelle.kunde_id -> is_claim_user_party(claim_id) (claim_parties = Ownership-SSoT).
-- SV-Leg (kanzlei_faelle): faelle.sv_id-Join -> is_sv_for_claim(claim_id) (claims.sv_id, CMM-60).
-- Kanzlei-Leg: faelle.service_typ -> claims.service_typ.
-- NICHT hier: die 20 can_access_fall-basierten staff_fall_scoped-Policies — folgen NACH dem
-- Batch-C-FK-Re-Key (parteien/nachrichten/tasks + call_*-Tische brauchen erst claim_id),
-- dann als EIN can_access_claim()-Pass.

ALTER POLICY auftraege_select_consolidated ON public.auftraege USING (
  (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role, 'kanzlei'::user_role])))
  OR (auftraege.claim_id IS NOT NULL AND is_claim_user_party(auftraege.claim_id))
  OR (EXISTS (SELECT 1 FROM sachverstaendige sv WHERE sv.id = auftraege.sv_id AND sv.profile_id = (SELECT auth.uid())))
);

ALTER POLICY "Kanzlei liest gutachter_termine" ON public.gutachter_termine USING (
  EXISTS (SELECT 1 FROM claims c JOIN profiles p ON p.id = (SELECT auth.uid())
          WHERE c.id = gutachter_termine.claim_id AND p.rolle = 'kanzlei'::user_role AND c.service_typ = 'komplett')
);

ALTER POLICY gutachter_termine_kunde_select_consolidated ON public.gutachter_termine USING (
  gutachter_termine.claim_id IS NOT NULL AND is_claim_user_party(gutachter_termine.claim_id)
);

ALTER POLICY kanzlei_faelle_select_consolidated ON public.kanzlei_faelle USING (
  (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role, 'kanzlei'::user_role])))
  OR (kanzlei_faelle.claim_id IS NOT NULL AND is_claim_user_party(kanzlei_faelle.claim_id))
  OR is_sv_for_claim(kanzlei_faelle.claim_id)
);
