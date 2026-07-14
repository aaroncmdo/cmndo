-- perf: consolidate multiple permissive policies on reparatur_termine into one
-- policy per command (Supabase advisor: multiple_permissive_policies). Each command
-- had 2 permissive policies (kunde-branch + staff/werkstatt-branch); Postgres OR-combines
-- permissive policies, so ONE policy with (qualA OR qualB) is provably identical. No ALL
-- policy on this table (clean merge, no restructure). Access-neutral. auth.uid() stays wrapped.
CREATE POLICY reparatur_termine_select_consolidated ON public.reparatur_termine FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM claims c
  WHERE ((c.id = reparatur_termine.claim_id) AND ((c.geschaedigter_user_id = ( SELECT auth.uid() AS uid)) OR is_claim_user_party(c.id)))))) OR ((is_staff() OR is_werkstatt_for_claim(claim_id))));

CREATE POLICY reparatur_termine_insert_consolidated ON public.reparatur_termine FOR INSERT TO authenticated WITH CHECK ((is_staff()) OR (((status = 'angefragt'::text) AND (EXISTS ( SELECT 1
   FROM claims c
  WHERE ((c.id = reparatur_termine.claim_id) AND (c.reparatur_werkstatt_id = reparatur_termine.werkstatt_id) AND ((c.geschaedigter_user_id = ( SELECT auth.uid() AS uid)) OR is_claim_user_party(c.id))))))));

CREATE POLICY reparatur_termine_update_consolidated ON public.reparatur_termine FOR UPDATE TO authenticated USING ((((status = 'werkstatt_vorschlag'::text) AND (EXISTS ( SELECT 1
   FROM claims c
  WHERE ((c.id = reparatur_termine.claim_id) AND ((c.geschaedigter_user_id = ( SELECT auth.uid() AS uid)) OR is_claim_user_party(c.id))))))) OR ((is_staff() OR is_werkstatt_for_claim(claim_id)))) WITH CHECK ((((status = ANY (ARRAY['bestaetigt'::text, 'anruf_erbeten'::text])) AND (EXISTS ( SELECT 1
   FROM claims c
  WHERE ((c.id = reparatur_termine.claim_id) AND ((c.geschaedigter_user_id = ( SELECT auth.uid() AS uid)) OR is_claim_user_party(c.id))))))) OR ((is_staff() OR is_werkstatt_for_claim(claim_id))));

DROP POLICY reparatur_termine_kunde_select ON public.reparatur_termine;
DROP POLICY reparatur_termine_select ON public.reparatur_termine;
DROP POLICY reparatur_termine_kunde_insert ON public.reparatur_termine;
DROP POLICY reparatur_termine_insert ON public.reparatur_termine;
DROP POLICY reparatur_termine_kunde_update ON public.reparatur_termine;
DROP POLICY reparatur_termine_update ON public.reparatur_termine;
