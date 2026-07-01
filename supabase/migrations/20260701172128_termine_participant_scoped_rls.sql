-- termine-RLS-Haertung (Handoff 4e248a04, Write-Path-Audit): die alte termine_all_auth-Policy
-- (authenticated ALL, with_check=null) erlaubte JEDEM authed User INSERT/UPDATE/DELETE jeder
-- Termin-Zeile UND SELECT aller (latenter Read-Leak). createTermin/updateTerminStatus
-- (src/app/faelle/[id]/_actions/termine.ts) sind User-Client OHNE App-Guard -> verliessen sich voll
-- auf diese offene Policy. Latent (0 Zeilen), real sobald Termine existieren.
-- Fix: participant-scoped. Alle 5 Consumer sind Staff (admin/KB/dispatch, is_staff) -> unberuehrt;
-- Teilnehmer (kunde/betreuer) duerfen kuenftig NUR ihre eigenen SELECTen (kein Write).
-- Cross-Rollen-Smoke gegen prod (2 Test-Zeilen): kunde A sieht 1/eigene + fremd-update=0;
-- staff(admin) sieht 2/alle + update=1; makler sieht 0. Danach Test-Zeilen wieder geloescht.
DROP POLICY IF EXISTS termine_all_auth ON public.termine;

CREATE POLICY termine_write_staff ON public.termine
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

CREATE POLICY termine_select_participant ON public.termine
  FOR SELECT TO authenticated
  USING (kunde_user_id = auth.uid() OR betreuer_user_id = auth.uid());
