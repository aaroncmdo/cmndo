-- CMM-23: is_staff() referenziert 'leadbearbeiter' — eine Rolle die nicht
-- mehr im user_role-Enum existiert. Dispatcher-Login crasht mit
-- "Database error querying schema" weil GoTrue beim Sign-in profiles via
-- der RLS-Policy "staff_read_all" liest, die is_staff() ruft, die crasht.
--
-- Gleiches Pattern wie cmm21_fix_can_access_fall — leadbearbeiter-Branch
-- entfernen. SECURITY DEFINER + STABLE setzen für Konsistenz mit den
-- anderen RLS-Helpers (is_admin / is_dispatcher / is_kundenbetreuer).

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND rolle IN ('admin'::user_role, 'kundenbetreuer'::user_role, 'dispatch'::user_role)
  );
$$;

-- is_admin auch konsistent setzen mit STABLE + search_path
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND rolle = 'admin'::user_role
  );
$$;

COMMENT ON FUNCTION public.is_staff IS
  'CMM-23: leadbearbeiter-Branch entfernt (Rolle existiert nicht mehr im user_role-Enum).';
