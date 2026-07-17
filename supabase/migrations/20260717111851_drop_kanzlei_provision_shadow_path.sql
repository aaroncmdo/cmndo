-- #9 Kanzlei-Schattenpfad entfernen (Aaron-Go 17.07., AskUserQuestion "Alles droppen").
-- trigger_kanzlei_provision schrieb bei jeder kanzlei-claimondo-Vollmacht-Signierung eine
-- finance_eintraege-Zeile (150 EUR 'offen'). finance_eintraege wird von NICHTS gelesen
-- (0 Views / 0 Functions / 0 App-Code; nur der generierte Typ), 5 tote Rows. Die echte
-- Kanzlei-Provision laeuft ueber generiereKanzleiAbrechnungen -> abrechnungen.
-- Reihenfolge: erst Trigger (stoppt den Insert), dann Function (dann verwaist), dann Table.
DROP TRIGGER IF EXISTS kanzlei_provision_trigger ON public.leads;
DROP FUNCTION IF EXISTS public.trigger_kanzlei_provision();
DROP TABLE IF EXISTS public.finance_eintraege;
