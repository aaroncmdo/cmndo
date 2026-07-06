-- Dispatch + Kundenbetreuer brauchen Lese-/Schreibzugriff auf gutachter_finder_anfragen
-- (Dispatch-Queue). Bisher hatte nur admin (gfa_admin_select/update) Zugriff -> die reinen
-- dispatch-User sahen 0 von ~2348 Anfragen (Queue komplett leer) und Status-Updates schlugen
-- still fehl (0-Zeilen-Update meldete faelschlich Erfolg). admin bleibt via gfa_admin_*;
-- hier NUR dispatch + kundenbetreuer ergaenzt (additiv, permissive -> ge-OR-t).
CREATE POLICY gfa_staff_select ON public.gutachter_finder_anfragen
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.rolle = ANY (ARRAY['dispatch','kundenbetreuer']::user_role[])
  ));

CREATE POLICY gfa_staff_update ON public.gutachter_finder_anfragen
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.rolle = ANY (ARRAY['dispatch','kundenbetreuer']::user_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.rolle = ANY (ARRAY['dispatch','kundenbetreuer']::user_role[])
  ));
