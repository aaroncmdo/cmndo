-- perf: wrap auth.uid() in a scalar subquery (select auth.uid()) in the 18 RLS
-- policies flagged by the Supabase advisor (auth_rls_initplan). This makes the
-- planner evaluate auth.uid() ONCE per query (initPlan-cached) instead of per row.
-- Semantically identical (documented Postgres RLS-perf pattern) — no access change.
ALTER POLICY comments_delete_own ON public.article_comments
  USING ((author_id = (select auth.uid())));
ALTER POLICY comments_insert_own_pending ON public.article_comments
  WITH CHECK ((((select auth.uid()) = author_id) AND (status = 'pending'::comment_status) AND (NOT (EXISTS ( SELECT 1
   FROM community_profiles p
  WHERE ((p.user_id = (select auth.uid())) AND p.is_blocked))))));
ALTER POLICY comments_select_approved_or_own ON public.article_comments
  USING (((status = 'approved'::comment_status) OR (author_id = (select auth.uid()))));
ALTER POLICY comments_update_own_pending ON public.article_comments
  USING ((author_id = (select auth.uid())))
  WITH CHECK (((author_id = (select auth.uid())) AND (status = 'pending'::comment_status)));
ALTER POLICY chat_teilnehmer_select ON public.chat_thread_teilnehmer
  USING ((is_staff() OR (user_id = (select auth.uid()))));
ALTER POLICY chat_teilnehmer_update_own ON public.chat_thread_teilnehmer
  USING ((user_id = (select auth.uid())))
  WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY community_likes_own_delete ON public.community_likes
  USING ((user_id = (select auth.uid())));
ALTER POLICY community_likes_own_insert ON public.community_likes
  WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY profiles_insert_own ON public.community_profiles
  WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY ffk_staff_all ON public.firmen_flotten_konten
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role]))))));
ALTER POLICY flotten_staff_all ON public.flotten_fahrzeuge
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role]))))));
ALTER POLICY linkedin_posts_admin_all ON public.linkedin_posts
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.rolle = 'admin'::user_role)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.rolle = 'admin'::user_role)))));
ALTER POLICY partner_lead_akt_staff_all ON public.partner_lead_aktivitaeten
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'leadbearbeiter'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'leadbearbeiter'::user_role]))))));
ALTER POLICY partner_leads_staff_all ON public.partner_leads
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'leadbearbeiter'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'leadbearbeiter'::user_role]))))));
ALTER POLICY partner_policy_admin_write ON public.partner_rollen_policy
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.rolle = 'admin'::user_role)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.rolle = 'admin'::user_role)))));
ALTER POLICY skt_staff_all ON public.schadenkarten
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role]))))));
ALTER POLICY termine_select_participant ON public.termine
  USING (((kunde_user_id = (select auth.uid())) OR (betreuer_user_id = (select auth.uid()))));
ALTER POLICY vertrieb_mail_vorlagen_staff ON public.vertrieb_mail_vorlagen
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]))))));
