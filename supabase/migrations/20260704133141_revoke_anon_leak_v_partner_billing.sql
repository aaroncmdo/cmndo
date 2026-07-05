-- Security-Hotfix (Aaron-GO 04.07.): v_partner_billing leakte 12 Zeilen Partner-Abrechnungsdaten an anon
-- (anon:SELECT ohne Row-Gate). check-claim-view-rls.mjs (build-Gate, empirisch gg prod) wurde rot ->
-- Release-Totalblocker (jeder PR-Build rot). Minimaler sicherer Fix = anon-Grant revoken (der Check
-- empfiehlt genau das). authenticated bleibt unangetastet (Partner-Portal). Follow-up (c613df86,
-- kanonische-partner-abrechnung): Row-Gate fuer authenticated in der view-Migration nachziehen
-- (gegen cross-partner-Leak, den der "nobody"/anon-Check nicht faengt).
-- Bereits via Supabase-Plugin apply_migration auf prod appliziert + getrackt (Version 20260704133141);
-- dieses File haelt Repo == DB (Regel 2, kein Twin-Drift).
REVOKE ALL ON public.v_partner_billing FROM anon;
