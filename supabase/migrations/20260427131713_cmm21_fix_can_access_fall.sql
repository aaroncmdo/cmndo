-- CMM-21: can_access_fall() bricht bei JEDER Query-Planung gegen Tabellen
-- mit staff_fall_scoped-Policy ab, weil sie f.leadbearbeiter_id referenziert
-- — eine Spalte die längst gedroppt wurde (leadbearbeiter-Rolle gibt es im
-- user_role-Enum nicht mehr).
--
-- Symptom: Kunde liest gutachter_termine → supabase-js bekommt error
-- (column "leadbearbeiter_id" does not exist), data=null, terminDatum bleibt
-- null → Onboarding zeigt "Wir suchen gerade einen passenden Sachverständigen…"
-- obwohl der Termin auf 'reserviert'/'bestaetigt' steht.
--
-- Tot: Wir entfernen den leadbearbeiter-Branch komplett. Admin/Dispatch +
-- Kundenbetreuer-Branch bleiben (sind die einzigen heute relevanten staff-
-- Rollen für Fall-Scope-Lesen).

CREATE OR REPLACE FUNCTION public.can_access_fall(p_fall_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND rolle IN ('admin'::user_role, 'dispatch'::user_role)
    )
    OR
    EXISTS (
      SELECT 1 FROM faelle f
      JOIN profiles p ON p.id = auth.uid()
      WHERE f.id = p_fall_id
        AND p.rolle = 'kundenbetreuer'::user_role
        AND f.kundenbetreuer_id = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.can_access_fall IS
  'CMM-21: leadbearbeiter-Branch entfernt (Rolle existiert nicht mehr im user_role-Enum, Spalte faelle.leadbearbeiter_id wurde gedroppt).';
