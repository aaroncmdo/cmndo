-- AAR-307: SV darf manuelle Tasks für seine eigenen Fälle anlegen.
-- Admin + KB/LB/Dispatch haben via "Mitarbeiter tasks" (is_staff) bereits Zugriff.
-- SV hat nur SELECT (zugewiesen_an = auth.uid()) — für INSERT braucht es eine
-- eigene Policy, die auf eigene Fälle beschränkt.
DROP POLICY IF EXISTS "sv_adhoc_task_insert" ON public.tasks;
CREATE POLICY "sv_adhoc_task_insert"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (
  auto_erstellt = false
  AND erstellt_von_id = auth.uid()
  AND is_sv()
  AND fall_id IN (
    SELECT f.id FROM faelle f
    JOIN sachverstaendige s ON s.id = f.sv_id
    WHERE s.profile_id = auth.uid()
  )
);

COMMENT ON POLICY "sv_adhoc_task_insert" ON public.tasks IS
  'AAR-307: SV kann manuelle Tasks nur für ihm zugewiesene Fälle anlegen (auto_erstellt=false, erstellt_von_id=auth.uid()).';;
