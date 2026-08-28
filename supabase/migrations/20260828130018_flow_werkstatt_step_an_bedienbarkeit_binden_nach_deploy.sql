-- Wiederanwendung von 20260828111338, diesmal NACH dem Deploy des zugehoerigen Codes.
--
-- Vorgeschichte: 20260828111338 stellte die Bedingung auf `werkstatt_waehlbar` um, bevor
-- der Code live war, der dieses Kontext-Feld liefert. `erfuelltBedingung` verglich
-- `undefined === 'ja'` -> false, der Werkstatt-Step war fuer ALLE Kunden ausgeblendet.
-- 20260828112934 rollte das ~16 Minuten spaeter zurueck.
--
-- Jetzt ist der Code auf prod (Release R427, Merge 15617ae11, App-Deploy gruen).
-- VOR dieser Migration nachgewiesen, nicht angenommen: der gebaute Code auf dem VPS
-- enthaelt `werkstatt_waehlbar` in zwei Flow-Chunks
-- (.next/server/chunks/ssr/src_app_flow_[token]_*.js), und src/lib/self-service/
-- flow-kontext.ts traegt das Feld. Damit ist die Bedingung erfuellbar.
--
-- Wirkung: der Werkstatt-Step erscheint nur noch dort, wo `waehleWerkstattFlow` ihn auch
-- annimmt (brauchtWerkstattVermittlung: reparaturwunsch IN ('reparatur','fiktiv')).
-- Zuvor bekamen Kunden, die die Abrechnungsfrage uebersprungen hatten, fuenf Werkstaetten
-- angeboten -- und jede Auswahl endete in "Fuer diesen Vorgang ist keine Werkstatt-Auswahl
-- moeglich."
--
-- Betrifft haftpflicht/kasko/selbstzahler. `werkstatt_anzeige` bleibt unveraendert.

update public.flow_szenario_steps
   set bedingung = '{"gutachten_vermittelt": null, "werkstatt_waehlbar": "ja"}'::jsonb
 where step_id = 'werkstatt'
   and bedingung = '{"gutachten_vermittelt": null, "reparatur_werkstatt_id": null}'::jsonb;
