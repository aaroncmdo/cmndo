DROP POLICY IF EXISTS partner_provisionen__b1sel ON public.partner_provisionen;
CREATE POLICY partner_provisionen__b1sel ON public.partner_provisionen
  FOR SELECT TO authenticated
  USING (
    ((partner_typ IN ('makler','makler_empfehlung')) AND EXISTS (
        SELECT 1 FROM public.makler m
        WHERE m.id = partner_provisionen.partner_id AND m.user_id = (SELECT auth.uid())))
    OR ((partner_typ = 'werkstatt') AND EXISTS (
        SELECT 1 FROM public.werkstaetten w
        WHERE w.id = partner_provisionen.partner_id AND w.user_id = (SELECT auth.uid())))
    OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND (p.rolle = 'admin'::user_role
               OR (p.rolle = 'kundenbetreuer'::user_role
                   AND partner_provisionen.partner_typ IN ('makler','makler_empfehlung'))))
  );
