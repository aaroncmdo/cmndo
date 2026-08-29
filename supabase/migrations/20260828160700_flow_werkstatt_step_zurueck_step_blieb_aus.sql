-- Zweite Rueckrollung, diesmal aus einem ANDEREN Grund als beim ersten Mal.
--
-- Der Code ist inzwischen auf main (inhaltlich verifiziert), die Bedingung wurde nach dem
-- Deploy erneut gesetzt — und der Werkstatt-Step blieb trotzdem aus, obwohl der Lead ihn
-- haben muesste: reparaturwunsch='reparatur', reparatur_werkstatt_id=null, werkstatt_id=null,
-- reparatur_vermittlung_status='offen' → brauchtWerkstattVermittlung = true.
--
-- Verdacht (noch nicht bewiesen): der Wizard baut STEPS aus einem Lead-Zustand, der beim
-- Mount geladen wurde. `reparaturwunsch` wird aber ERST MITTEN IM FLOW beantwortet
-- (Feststellungs-Schritt "Wie moechtest du den Schaden abrechnen?"). Zum Zeitpunkt der
-- Step-Berechnung ist das Feld also noch leer → werkstatt_waehlbar=null → Step faellt raus.
-- Genau davor warnt der Kommentar an `initialNeedsWerkstatt` in FlowWizardKfz.tsx
-- ("damit STEPS mid-Flow nicht schrumpft/waechst").
--
-- Alte Bedingung (`reparatur_werkstatt_id: null`) hat dieses Problem nicht: sie prueft ein
-- Feld, das zum Mount-Zeitpunkt bereits seinen Endwert hat.
--
-- Bis das geklaert ist, gilt der Alt-Stand: lieber ein Step, der manchmal nicht annimmt,
-- als ein Step, der fuer ALLE verschwindet.

update public.flow_szenario_steps
   set bedingung = '{"gutachten_vermittelt": null, "reparatur_werkstatt_id": null}'::jsonb
 where step_id = 'werkstatt'
   and bedingung = '{"gutachten_vermittelt": null, "werkstatt_waehlbar": "ja"}'::jsonb;
