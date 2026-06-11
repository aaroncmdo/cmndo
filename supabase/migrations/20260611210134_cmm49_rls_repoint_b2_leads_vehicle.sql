-- CMM-49 RLS-Repoint Batch 2: leads(2) + vehicle(2) Policies faelle -> claims-direkt.
-- Value-neutral EMPIRISCH bewiesen (leads_sv/leads_kb/vehicles_sv visible-set mismatch=0/0/0)
-- via lead_id/sv_id/kundenbetreuer_id 0-diff + Orphan-Claim (sv_id NULL) excluded. faelle-Hop
-- (f JOIN claims c ON c.id=f.claim_id) gedroppt — claims hat lead_id/sv_id/vehicle_id nativ.

ALTER POLICY leads_makler_sv_select_consolidated ON leads
  USING (((EXISTS ( SELECT 1 FROM (promotion_codes pc JOIN makler m ON ((m.id = pc.makler_id))) WHERE ((pc.id = leads.promotion_code_id) AND (m.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1 FROM ((claims c JOIN sachverstaendige sv ON ((sv.id = c.sv_id))) JOIN profiles p ON ((p.id = (SELECT auth.uid())))) WHERE ((c.lead_id = leads.id) AND (p.id = (SELECT auth.uid())) AND (p.rolle = 'sachverstaendiger'::user_role))))));

ALTER POLICY leads_staff_all_consolidated ON leads
  USING ((is_admin() OR (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]))))) OR (EXISTS ( SELECT 1 FROM (claims c JOIN profiles p ON ((p.id = (SELECT auth.uid())))) WHERE ((c.lead_id = leads.id) AND (p.rolle = 'kundenbetreuer'::user_role) AND (c.kundenbetreuer_id = (SELECT auth.uid())))))))
  WITH CHECK ((is_admin() OR (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]))))) OR (EXISTS ( SELECT 1 FROM (claims c JOIN profiles p ON ((p.id = (SELECT auth.uid())))) WHERE ((c.lead_id = leads.id) AND (p.rolle = 'kundenbetreuer'::user_role) AND (c.kundenbetreuer_id = (SELECT auth.uid())))))));

ALTER POLICY vehicles_select_public_consol ON vehicles
  USING (((current_owner_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM (claims c JOIN sachverstaendige sv ON ((sv.id = c.sv_id))) WHERE ((c.vehicle_id = vehicles.id) AND (sv.profile_id = (SELECT auth.uid())))))));

ALTER POLICY vehicle_ownership_history_select_public_consol ON vehicle_ownership_history
  USING (((EXISTS ( SELECT 1 FROM (claims c JOIN sachverstaendige sv ON ((sv.id = c.sv_id))) WHERE ((c.vehicle_id = vehicle_ownership_history.vehicle_id) AND (sv.profile_id = (SELECT auth.uid()))))) OR (user_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM vehicles v WHERE ((v.id = vehicle_ownership_history.vehicle_id) AND (v.current_owner_id = (SELECT auth.uid())))))));
