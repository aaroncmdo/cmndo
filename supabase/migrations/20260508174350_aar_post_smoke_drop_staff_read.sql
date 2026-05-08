-- E2E-Smoke 2026-05-08 (F-14 Folge): sv_tages_session_staff_read entfernen.
--
-- Vorherige Migration (sv_tages_session_rls) hat saubere Policies für SV-eigen,
-- Admin-All und Dispatch-Read angelegt. Es existiert aber zusätzlich eine alte
-- Policy `sv_tages_session_staff_read` mit `qual = is_staff()`, die admin +
-- kundenbetreuer + dispatch erlaubt. KB hat damit Zugriff auf alle SV-Tages-
-- pläne — inkl. der privaten Stops aus AAR-872.
--
-- KB sollte SV-Tagespläne nicht sehen können (kein Use-Case + private Stops
-- enthalten persönliche Information). Admin + Dispatch sind durch die
-- bereits angelegten Policies abgedeckt; die Staff-Catchall ist redundant
-- und zu permissiv.

DROP POLICY IF EXISTS sv_tages_session_staff_read ON public.sv_tages_session;
