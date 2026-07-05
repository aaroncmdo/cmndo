-- Security-Hotfix Teil 2 (Aaron-GO 04.07.): revoke-anon (20260704133141) war unzureichend — der
-- check-claim-view-rls "Nobody-User" ist ein authenticated-JWT ohne gueltigen User, und mit
-- security_invoker=true + authenticated:SELECT + fehlendem Row-Gate sieht auch der weiter alle 12 Zeilen.
-- v_partner_billing hat 0 Code-Consumer (git grep src/ = leer) = unkonsumierte WIP-View (c613df86,
-- kanonische-partner-abrechnung) -> authenticated revoken bricht NICHTS und schliesst den Leak.
-- Nur service_role/postgres liest die View jetzt. Follow-up c613df86: beim Verdrahten korrektes
-- Row-Gate (claim_sichtbar_fuer_aktuellen_user) + kontrollierte Grants setzen.
-- Bereits via apply_migration prod-appliziert + getrackt (20260704134041); File haelt Repo==DB (Regel 2).
REVOKE ALL ON public.v_partner_billing FROM authenticated;
