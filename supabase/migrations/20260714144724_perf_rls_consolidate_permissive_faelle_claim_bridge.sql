-- perf: consolidate the 2 permissive SELECT policies on faelle_claim_bridge into one
-- (Supabase advisor: multiple_permissive_policies). Both were SELECT/authenticated
-- (gate_select via claim_sichtbar_fuer_aktuellen_user + select_consolidated inline);
-- Postgres OR-combines permissive policies, so ONE policy with (A OR B) is provably
-- identical. No ALL/public/anon policy on this table (clean merge). CREATE-first (no gap).
-- Hot core table (claim-access bridge) -> real perf value; auth.uid() stays wrapped.
CREATE POLICY faelle_claim_bridge_select ON public.faelle_claim_bridge FOR SELECT TO authenticated USING ((claim_sichtbar_fuer_aktuellen_user(claim_id)) OR ((is_admin() OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'dispatch'::user_role)))) OR ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'kundenbetreuer'::user_role)))) AND (EXISTS ( SELECT 1
   FROM claims c
  WHERE ((c.id = faelle_claim_bridge.claim_id) AND (c.kundenbetreuer_id = ( SELECT auth.uid() AS uid)))))) OR (EXISTS ( SELECT 1
   FROM claims c
  WHERE ((c.id = faelle_claim_bridge.claim_id) AND ((c.geschaedigter_user_id = ( SELECT auth.uid() AS uid)) OR (c.sv_id IN ( SELECT sachverstaendige.id
           FROM sachverstaendige
          WHERE (sachverstaendige.profile_id = ( SELECT auth.uid() AS uid)))) OR ((c.service_typ = 'komplett'::text) AND (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'kanzlei'::user_role))))))))) OR (EXISTS ( SELECT 1
   FROM (makler_fall_consent mfc
     JOIN makler m ON ((m.id = mfc.makler_id)))
  WHERE ((mfc.fall_id = faelle_claim_bridge.fall_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (mfc.widerrufen_am IS NULL)))))));
DROP POLICY faelle_claim_bridge_gate_select ON public.faelle_claim_bridge;
DROP POLICY faelle_claim_bridge_select_consolidated ON public.faelle_claim_bridge;
