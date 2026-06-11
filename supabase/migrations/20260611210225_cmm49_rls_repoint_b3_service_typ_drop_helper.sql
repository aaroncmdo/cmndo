-- CMM-49 RLS-Repoint Batch 3: 3 Kanzlei-service_typ-Policies -> claims.service_typ (SSoT).
-- NICHT value-neutral (Aaron-Entscheid): faelle.service_typ ist stale (39/79 faelle=komplett aber
-- claims=nur_gutachter, 0 Kanzlei-Mandat = latente Ueber-Exposition). claims.service_typ ist SSoT
-- (CMM-44 SP-B), konsistent zur Bridge-Policy. Verschaerft Kanzlei-Sicht 69->34 (behebt Bug).
-- Verifiziert: alle 12 aktiven Kanzlei-Mandate (kanzlei_faelle) bleiben sichtbar, 0 versteckt.
-- + DROP can_access_fall (0-Consumer, queryt faelle, SECURITY DEFINER).

ALTER POLICY "Kanzlei liest fall_dokumente" ON fall_dokumente
  USING ((EXISTS ( SELECT 1 FROM ((faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) JOIN profiles ON ((profiles.id = (SELECT auth.uid())))) WHERE ((b.fall_id = fall_dokumente.fall_id) AND (profiles.rolle = 'kanzlei'::user_role) AND (c.service_typ = 'komplett'::text)))));

ALTER POLICY "Kanzlei liest timeline" ON timeline
  USING ((EXISTS ( SELECT 1 FROM ((faelle_claim_bridge b JOIN claims c ON ((c.id = b.claim_id))) JOIN profiles ON ((profiles.id = (SELECT auth.uid())))) WHERE ((b.fall_id = timeline.fall_id) AND (profiles.rolle = 'kanzlei'::user_role) AND (c.service_typ = 'komplett'::text)))));

ALTER POLICY leads_kanzlei_kb_select_consolidated ON leads
  USING (((EXISTS ( SELECT 1 FROM (claims c JOIN profiles ON ((profiles.id = (SELECT auth.uid())))) WHERE ((c.lead_id = leads.id) AND (profiles.rolle = 'kanzlei'::user_role) AND (c.service_typ = 'komplett'::text)))) OR (EXISTS ( SELECT 1 FROM (claims c JOIN profiles p ON ((p.id = (SELECT auth.uid())))) WHERE ((c.lead_id = leads.id) AND (p.rolle = 'kundenbetreuer'::user_role) AND (c.kundenbetreuer_id = (SELECT auth.uid())))))));

DROP FUNCTION IF EXISTS public.can_access_fall(uuid);
