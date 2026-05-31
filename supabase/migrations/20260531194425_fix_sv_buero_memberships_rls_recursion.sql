-- Fix: "infinite recursion detected in policy for relation sv_buero_memberships".
-- Die Policy sv_buero_memberships_all_public_consol referenzierte in USING + WITH CHECK
-- die EIGENE Tabelle (EXISTS SELECT 1 FROM sv_buero_memberships m2 ...) -> jeder Zugriff
-- (auch SELECT) loeste RLS-Rekursion aus -> SV-Buero-Feature fuer Nicht-Admins komplett tot.
-- Fix: die rekursive Buero-Admin-Pruefung in eine SECURITY DEFINER-Funktion auslagern
-- (laeuft als Owner -> umgeht RLS auf sv_buero_memberships -> keine Rekursion). Semantik
-- EXAKT erhalten: USING = global-admin OR buero-admin; WITH CHECK = buero-admin (Asymmetrie
-- aus der urspruenglichen Consolidation BEWUSST unveraendert gelassen — nur de-rekursiert).

CREATE OR REPLACE FUNCTION public.is_buero_admin(p_buero_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sv_buero_memberships m2
    JOIN sachverstaendige sv ON sv.id = m2.sv_id
    WHERE m2.buero_id = p_buero_id
      AND sv.profile_id = (SELECT auth.uid())
      AND m2.rolle = 'admin'
      AND m2.end_date IS NULL
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_buero_admin(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_buero_admin(uuid) TO authenticated, anon;

DROP POLICY IF EXISTS sv_buero_memberships_all_public_consol ON public.sv_buero_memberships;
CREATE POLICY sv_buero_memberships_all_public_consol ON public.sv_buero_memberships
  FOR ALL
  TO public
  USING (
    (EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = 'admin'::user_role
    ))
    OR public.is_buero_admin(sv_buero_memberships.buero_id)
  )
  WITH CHECK (
    public.is_buero_admin(sv_buero_memberships.buero_id)
  );
