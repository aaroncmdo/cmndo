-- CMM-49 (ab96fed4 Gate-a-Review-Blocker fuer #2664): 2 RLS-Policies gateten auf
-- gutachter_termine.sv_id. Ab dem Writer-Flip (#2664, sv_id=NULL auf neuen Rows) saehen SVs
-- ihre neuen Termine nicht mehr (USING), non-admin-Writes failten die CHECK, und Kunde/SV
-- verloere Live-Position-Zugriff. Repoint auf assignee_id/assignee_typ.
--
-- VALUE-NEUTRAL (Probe vor Apply == 0):
--   SELECT count(*) FROM gutachter_termine
--   WHERE (sv_id IS NOT NULL) <> (assignee_typ='sachverstaendiger' AND assignee_id IS NOT NULL);
-- Bereits via apply_migration appliziert (recorded version 20260611121140); File = Regel-2-Tracking.

ALTER POLICY gutachter_termine_admin_sv_all_consolidated ON public.gutachter_termine
  USING (
    ((SELECT rolle FROM public.profiles WHERE id = (SELECT auth.uid())) = 'admin'::user_role)
    OR (assignee_typ = 'sachverstaendiger' AND assignee_id IN (SELECT id FROM public.sachverstaendige WHERE profile_id = (SELECT auth.uid())))
  )
  WITH CHECK (
    ((SELECT rolle FROM public.profiles WHERE id = (SELECT auth.uid())) = 'admin'::user_role)
    OR (assignee_typ = 'sachverstaendiger' AND assignee_id IN (SELECT id FROM public.sachverstaendige WHERE profile_id = (SELECT auth.uid())))
  );

ALTER POLICY kunde_live_position_select_public_consol ON public.kunde_live_position
  USING (
    is_staff() OR EXISTS (
      SELECT 1 FROM public.gutachter_termine gt
      WHERE gt.id = kunde_live_position.termin_id
        AND gt.assignee_typ = 'sachverstaendiger'
        AND gt.assignee_id = get_sv_id()
    )
  );
