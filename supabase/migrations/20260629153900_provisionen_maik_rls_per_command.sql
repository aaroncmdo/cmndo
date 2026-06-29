-- provisionen_maik RLS-Härtung: die alte EINE Policy war cmd=ALL für admin/kundenbetreuer/dispatch
-- -> confirm/pay/reverse (UPDATE) + lesen (SELECT) waren auch für KB/dispatch offen (DB-Schicht;
-- App-Guard #3315 deckte nur die UI-Actions). Per-Command-Split:
--   SELECT/UPDATE/DELETE = admin-only (sensible Provisions-Ops).
--   INSERT = admin + dispatch (AAR-92: Dispatch trackt Maik-Provision bei google-ads/sea-Leads,
--     user-scoped in dispatch-fall-actions.ts -> MUSS erlaubt bleiben). kundenbetreuer raus (kein Consumer).
--   cron = service_role (RLS-moot).
DROP POLICY IF EXISTS "Mitarbeiter provisionen_maik" ON public.provisionen_maik;

CREATE POLICY "provisionen_maik_admin_select" ON public.provisionen_maik
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "provisionen_maik_admin_update" ON public.provisionen_maik
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "provisionen_maik_admin_delete" ON public.provisionen_maik
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "provisionen_maik_insert_admin_dispatch" ON public.provisionen_maik
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role])
    )
  );
