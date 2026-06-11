-- CMM-49 RLS-Repoint Batch 1: 15 kunde/sv/makler-ownership Policies faelle -> claims.
-- Value-neutral EMPIRISCH bewiesen (per-User visible-fall-set OLD==NEW: kunde/sv/makler mismatch=0/0/0)
-- + 0-diff (geschaedigter_user_id==kunde_id, sv_id, makler_id) + bridge 1:1 (bridge.fall_id==faelle.id,
-- FK #2688 garantiert child.fall_id in bridge). fall_id-gekeyte Child-Policies -> bridge-join
-- (faelle_claim_bridge b JOIN claims c ON c.id=b.claim_id WHERE b.fall_id=child.fall_id), robust gegen
-- claim_id-Timing/null. claim_mietwagen (claim_id-gekeyt) -> claims-direkt. KEIN service_typ (=Batch 3).

ALTER POLICY cm_kunde_select ON claim_mietwagen
  USING (claim_id IN ( SELECT c.id FROM (claims c JOIN profiles p ON ((p.id = (SELECT auth.uid()))))
    WHERE ((c.geschaedigter_user_id = (SELECT auth.uid())) AND (p.rolle = 'kunde'::user_role))));

ALTER POLICY "SV eigene Fall-Dokumente" ON fall_dokumente
  USING (fall_id IN ( SELECT b.fall_id FROM (faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id)))
    WHERE (c.sv_id IN ( SELECT sachverstaendige.id FROM sachverstaendige WHERE (sachverstaendige.profile_id = (SELECT auth.uid()))))));

ALTER POLICY fall_dokumente_kunde_insert ON fall_dokumente
  WITH CHECK (((uploaded_by_kunde = true) AND (EXISTS ( SELECT 1 FROM (faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id)))
    WHERE ((b.fall_id = fall_dokumente.fall_id) AND (c.geschaedigter_user_id = (SELECT auth.uid())))))));

ALTER POLICY fall_dokumente_kunde_read ON fall_dokumente
  USING (((EXISTS ( SELECT 1 FROM (faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id)))
    WHERE ((b.fall_id = fall_dokumente.fall_id) AND (c.geschaedigter_user_id = (SELECT auth.uid()))))) AND (sichtbar_fuer @> ARRAY['kunde'::text])));

ALTER POLICY nachrichten_insert_public_consol ON nachrichten
  WITH CHECK ((((kanal = 'portal-kunde-gutachter'::text) AND (sender_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1 FROM ((faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) JOIN sachverstaendige s ON ((s.id = c.sv_id))) WHERE ((b.fall_id = nachrichten.fall_id) AND (s.profile_id = (SELECT auth.uid())))))) OR ((kanal = ANY (ARRAY['portal-kunde-claimondo'::text, 'portal-kunde-gutachter'::text])) AND (sender_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1 FROM (faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) WHERE ((b.fall_id = nachrichten.fall_id) AND (c.geschaedigter_user_id = (SELECT auth.uid()))))))));

ALTER POLICY nachrichten_select_public_consol ON nachrichten
  USING ((((kanal = 'portal-kunde-gutachter'::text) AND (EXISTS ( SELECT 1 FROM ((faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) JOIN sachverstaendige s ON ((s.id = c.sv_id))) WHERE ((b.fall_id = nachrichten.fall_id) AND (s.profile_id = (SELECT auth.uid())))))) OR ((kanal = ANY (ARRAY['chat_kb_kunde'::text, 'chat_kunde_sv'::text, 'gruppenchat'::text, 'portal-kunde-claimondo'::text, 'portal-kunde-gutachter'::text])) AND ((sender_id = (SELECT auth.uid())) OR (empfaenger_id = (SELECT auth.uid())) OR ((fall_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM (faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) WHERE ((b.fall_id = nachrichten.fall_id) AND (c.geschaedigter_user_id = (SELECT auth.uid()))))))))));

ALTER POLICY "Kunden eigene Dokumente" ON pflichtdokumente
  USING ((fall_id IN ( SELECT b.fall_id FROM (faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) WHERE (c.geschaedigter_user_id = (SELECT auth.uid())))));

ALTER POLICY pflichtdokumente_select_authenticated_consol ON pflichtdokumente
  USING (((EXISTS ( SELECT 1 FROM (faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) WHERE ((b.fall_id = pflichtdokumente.fall_id) AND (c.geschaedigter_user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1 FROM ((faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) JOIN sachverstaendige sv ON ((sv.id = c.sv_id))) WHERE ((b.fall_id = pflichtdokumente.fall_id) AND (sv.profile_id = (SELECT auth.uid())))))));

ALTER POLICY pflichtdokumente_update_authenticated_consol ON pflichtdokumente
  USING (((EXISTS ( SELECT 1 FROM (faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) WHERE ((b.fall_id = pflichtdokumente.fall_id) AND (c.geschaedigter_user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1 FROM ((faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) JOIN sachverstaendige sv ON ((sv.id = c.sv_id))) WHERE ((b.fall_id = pflichtdokumente.fall_id) AND (sv.profile_id = (SELECT auth.uid())))))))
  WITH CHECK (((EXISTS ( SELECT 1 FROM (faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) WHERE ((b.fall_id = pflichtdokumente.fall_id) AND (c.geschaedigter_user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1 FROM ((faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) JOIN sachverstaendige sv ON ((sv.id = c.sv_id))) WHERE ((b.fall_id = pflichtdokumente.fall_id) AND (sv.profile_id = (SELECT auth.uid())))))));

ALTER POLICY sv_adhoc_task_insert ON tasks
  WITH CHECK (((auto_erstellt = false) AND (erstellt_von_id = (SELECT auth.uid())) AND is_sv() AND (fall_id IN ( SELECT b.fall_id FROM ((faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) JOIN sachverstaendige s ON ((s.id = c.sv_id))) WHERE (s.profile_id = (SELECT auth.uid()))))));

ALTER POLICY tasks_select_authenticated_consol ON tasks
  USING (((zugewiesen_an = (SELECT auth.uid())) OR (fall_id IN ( SELECT b.fall_id FROM (faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) WHERE (c.geschaedigter_user_id = (SELECT auth.uid()))))));

ALTER POLICY timeline_select_authenticated_consol ON timeline
  USING (((fall_id IN ( SELECT b.fall_id FROM ((faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) JOIN sachverstaendige s ON ((s.id = c.sv_id))) WHERE (s.profile_id = (SELECT auth.uid())))) OR (fall_id IN ( SELECT b.fall_id FROM (faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) WHERE (c.geschaedigter_user_id = (SELECT auth.uid()))))));

ALTER POLICY "Gutachter read own qc_checkliste" ON qc_checkliste
  USING ((EXISTS ( SELECT 1 FROM ((faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) JOIN sachverstaendige sv ON ((sv.id = c.sv_id))) WHERE ((b.fall_id = qc_checkliste.fall_id) AND (sv.profile_id = (SELECT auth.uid()))))));

ALTER POLICY phase_transitions_own_fall ON phase_transitions
  USING ((fall_id IN ( SELECT b.fall_id FROM (faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) WHERE ((c.geschaedigter_user_id = (SELECT auth.uid())) OR (c.sv_id IN ( SELECT s.id FROM sachverstaendige s WHERE (s.profile_id = (SELECT auth.uid())))) OR (c.makler_id IN ( SELECT m.id FROM makler m WHERE (m.user_id = (SELECT auth.uid()))))))));

ALTER POLICY personenschaden_personen_all_public_consol ON personenschaden_personen
  USING (((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role]))))) OR ((fall_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM (faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) WHERE ((b.fall_id = personenschaden_personen.fall_id) AND (c.geschaedigter_user_id = (SELECT auth.uid()))))))))
  WITH CHECK (((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role]))))) OR ((fall_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM (faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) WHERE ((b.fall_id = personenschaden_personen.fall_id) AND (c.geschaedigter_user_id = (SELECT auth.uid()))))))));
