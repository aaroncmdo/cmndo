-- Wiederanwendung von 20260828111338, jetzt NACH dem Deploy des zugehoerigen Codes.
--
-- `werkstatt_waehlbar` entsteht in src/lib/self-service/flow-kontext.ts und ist seit PR #5717
-- auf main (inhaltlich gegen origin/main verifiziert). Der erste Versuch lief dem Deploy
-- voraus und wurde nach 16 Minuten zurueckgerollt (20260828112934) — siehe dort.
--
-- Zweck: Der Werkstatt-Step erscheint nur noch, wenn ihn die Server-Action auch annehmen kann
-- (`brauchtWerkstattVermittlung` verlangt reparaturwunsch IN ('reparatur','fiktiv')). Vorher
-- bekam jeder, der die Pflichtfrage "Wie moechtest du den Schaden abrechnen?" uebersprang,
-- fuenf Werkstaetten angeboten — und jede Auswahl endete in "Fuer diesen Vorgang ist keine
-- Werkstatt-Auswahl moeglich."

update public.flow_szenario_steps
   set bedingung = '{"gutachten_vermittelt": null, "werkstatt_waehlbar": "ja"}'::jsonb
 where step_id = 'werkstatt'
   and bedingung = '{"gutachten_vermittelt": null, "reparatur_werkstatt_id": null}'::jsonb;
