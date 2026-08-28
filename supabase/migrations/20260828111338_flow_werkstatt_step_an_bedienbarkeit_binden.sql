-- Der Werkstatt-Step erschien auch dann, wenn ihn die Server-Action gar nicht annehmen kann.
--
-- Die Step-Bedingung prueft bisher nur `reparatur_werkstatt_id`; das Gate der Server-Action
-- (`waehleWerkstattFlow` -> `brauchtWerkstattVermittlung`) verlangt zusaetzlich
-- `reparaturwunsch IN ('reparatur','fiktiv')`. Wer die Pflichtfrage "Wie moechtest du den
-- Schaden abrechnen?" ueberspringt, bekam anschliessend fuenf Werkstaetten angeboten — und
-- jede Auswahl endete in "Fuer diesen Vorgang ist keine Werkstatt-Auswahl moeglich."
-- Prod-verifiziert am 28.08.2026 ueber die echte Oberflaeche.
--
-- `werkstatt_waehlbar` ist ein abgeleitetes Kontext-Feld (src/lib/self-service/flow-kontext.ts),
-- das GENAU dieselbe Funktion aufruft wie das Server-Gate. Anzeige und Annahme koennen damit
-- nicht mehr auseinanderlaufen. Die bisherige `reparatur_werkstatt_id: null`-Pruefung entfaellt,
-- weil `brauchtWerkstattVermittlung` sie bereits enthaelt (inkl. `werkstatt_id`).
--
-- Betrifft die drei Szenarien mit Werkstatt-Step (haftpflicht/kasko/selbstzahler). Risikoarm:
-- `reparaturwunsch` ist ein Pflichtfeld mit audience='beide' und ohne conditional_on — es wird
-- in JEDEM Szenario gestellt. Ausgeblendet wird der Step also nur dort, wo er ohnehin nichts
-- bewirkt. `werkstatt_anzeige` (zeigt die GEWAEHLTE Werkstatt) bleibt unveraendert.

update public.flow_szenario_steps
   set bedingung = '{"gutachten_vermittelt": null, "werkstatt_waehlbar": "ja"}'::jsonb
 where step_id = 'werkstatt'
   and bedingung = '{"gutachten_vermittelt": null, "reparatur_werkstatt_id": null}'::jsonb;
